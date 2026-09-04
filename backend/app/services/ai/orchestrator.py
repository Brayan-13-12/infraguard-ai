"""One turn of an AI conversation, end to end.

Flow (see docs/architecture.md):

    resolve + RBAC-check context
      -> persist the user message, derive a title if it's the first one, COMMIT
         (the slow provider call then runs with **no open write transaction**)
      -> run the provider (deterministic | openai); tools do fresh bounded reads,
         each authorized against the caller's permissions
      -> persist the assistant message with bounded, sanitized evidence metadata
      -> COMMIT and return both messages

On provider / tool failure nothing fake is written: a typed :class:`AIError` is
raised, the user message stays (the conversation is usable for retry), and the
route returns a recoverable error. When the *next* turn starts, that dangling
user message (a user turn with no assistant reply) is swept, so a retry
regenerates the turn instead of stacking a second identical user message.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import AIConversation, AIMessage, AIMessageRole
from app.models.user import User
from app.services.ai import conversations as conv_service
from app.services.ai.context import resolve_conversation_context
from app.services.ai.providers import (
    AIProvider,
    HistoryTurn,
    ProviderError,
    ProviderRequest,
    ProviderTimeout,
    ProviderUnavailable,
    ProviderUnsupported,
    get_provider,
)
from app.services.ai.tools import ToolError, ToolExecutor

_METADATA_MAX_CHARS = 6000


class AIError(Exception):
    """Recoverable turn failure. ``code`` is one of ``provider_unavailable`` /
    ``provider_timeout`` / ``tool_failure`` / ``provider_unsupported``."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class Turn:
    conversation: AIConversation
    user_message: AIMessage
    assistant_message: AIMessage


def _sanitize_metadata(executor: ToolExecutor, suggestions: list[str], provider: str) -> dict:
    meta = {
        "provider": provider,
        "evidence": [e.model_dump() for e in executor.collected_evidence()],
        "entities": [e.model_dump() for e in executor.collected_entities()],
        "suggestions": [s[:160] for s in suggestions[:4]],
    }
    if len(str(meta)) > _METADATA_MAX_CHARS:  # pragma: no cover - defensive
        meta = {"provider": provider, "evidence": [], "entities": [], "suggestions": []}
    return meta


def run_turn(
    db: Session,
    *,
    user: User,
    permissions: frozenset[str],
    conversation: AIConversation,
    content: str,
    provider: AIProvider | None = None,
) -> Turn:
    provider = provider or get_provider()

    ctx = resolve_conversation_context(db, conversation, permissions)

    existing = conv_service.get_messages(db, conversation.id)
    # A prior turn whose provider call failed leaves a dangling user message
    # (no assistant reply). Sweep it so this call regenerates that turn rather
    # than appending a second identical user message. Only ever a trailing
    # unanswered "user" message - which the normal flow never otherwise leaves.
    if existing and existing[-1].role == AIMessageRole.USER.value:
        conv_service.remove_message(db, existing[-1])
        existing = existing[:-1]
    had_messages = bool(existing)

    user_message = conv_service.add_message(
        db, conversation=conversation, role=AIMessageRole.USER, content=content
    )
    if not had_messages and conversation.title == "Nueva conversación":
        conversation.title = conv_service.derive_title(content)
        db.add(conversation)
    db.flush()
    # Release the write transaction before the (possibly slow) provider call.
    db.commit()

    history = [
        HistoryTurn(role=m.role, content=m.content)
        for m in conv_service.recent_messages(db, conversation.id, settings.AI_HISTORY_WINDOW)
        if m.id != user_message.id
    ]

    executor = ToolExecutor(db, permissions)
    request = ProviderRequest(user_message=content, history=history, context=ctx, executor=executor)

    try:
        result = provider.generate(request)
    except ProviderTimeout as exc:
        db.rollback()
        raise AIError(
            "provider_timeout", "El proveedor de IA tardó demasiado en responder."
        ) from exc
    except ProviderUnsupported as exc:
        db.rollback()
        raise AIError("provider_unsupported", str(exc) or "Consulta no soportada.") from exc
    except (ProviderUnavailable, ProviderError) as exc:
        db.rollback()
        raise AIError(
            "provider_unavailable",
            "El proveedor de IA no está disponible en este momento. Inténtalo de nuevo.",
        ) from exc
    except ToolError as exc:  # providers catch these; belt and braces
        db.rollback()
        raise AIError("tool_failure", "No se pudo obtener la información solicitada.") from exc

    metadata = _sanitize_metadata(executor, result.suggestions, provider.name)
    assistant_message = conv_service.add_message(
        db,
        conversation=conversation,
        role=AIMessageRole.ASSISTANT,
        content=result.text.strip() or "…",
        metadata=metadata,
    )
    db.commit()
    db.refresh(conversation)
    return Turn(conversation, user_message, assistant_message)
