"""One bounded read-only turn; JSON and SSE share persistence and retry semantics."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from threading import Lock

from sqlalchemy.exc import SQLAlchemyError
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
    ProviderUnavailable,
    get_provider,
)
from app.services.ai.tools import ToolError, ToolExecutor

logger = logging.getLogger(__name__)
_lock = Lock()
_active_users: set[uuid.UUID] = set()
_READ_PERMISSIONS = frozenset({"assets.read", "incidents.read", "audit.read", "relationships.read"})


class AIError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@contextmanager
def turn_slot(user_id: uuid.UUID):
    """One active turn per user/process; also protects conversation deletion."""
    with _lock:
        if user_id in _active_users:
            raise AIError(
                "turn_in_progress", "Ya hay una respuesta en curso. Inténtalo al terminar."
            )
        _active_users.add(user_id)
    try:
        yield
    finally:
        with _lock:
            _active_users.discard(user_id)


@dataclass(slots=True)
class Turn:
    conversation: AIConversation
    user_message: AIMessage
    assistant_message: AIMessage


def history_allowed(message: AIMessage, permissions: frozenset[str]) -> bool:
    if message.role == "user":
        return True
    # Legacy answers did not record permissions; fail closed after a role reduction.
    required = (message.message_metadata or {}).get("read_permissions", list(_READ_PERMISSIONS))
    return set(required) <= permissions


def _suggestions(executor: ToolExecutor) -> list[str]:
    pairs = (
        ("get_asset_impact", "¿Qué activos podrían verse afectados por una falla?"),
        ("search_incidents", "¿Qué incidentes abiertos están relacionados?"),
        ("search_audit", "¿Qué cambios recientes hubo en esos activos?"),
        ("search_assets", "Compara los activos encontrados."),
    )
    return [text for name, text in pairs if executor.can(name)][:4]


def _sanitize_metadata(executor: ToolExecutor, suggestions: list[str], provider: str) -> dict:
    # No model-created IDs or unverified model-generated follow-ups cross this boundary.
    return {
        "provider": provider,
        "evidence": [e.model_dump() for e in executor.collected_evidence()][:16],
        "entities": [e.model_dump() for e in executor.collected_entities()],
        "suggestions": _suggestions(executor),
        "tool_summary": list(dict.fromkeys(c.result.evidence.source for c in executor.calls)),
        "tool_count": len(executor.calls),
    }


def run_turn(db: Session, **kwargs) -> Turn:
    for kind, data in stream_turn(db, **kwargs):
        if kind == "turn.completed":
            return data
    raise AIError("provider_unavailable", "No se completó la respuesta.")


def stream_turn(
    db: Session,
    *,
    user: User,
    permissions: frozenset[str],
    conversation: AIConversation,
    content: str,
    provider: AIProvider | None = None,
    request_id: uuid.UUID | None = None,
) -> Iterator[tuple[str, object]]:
    with turn_slot(user.id):
        yield from _stream_turn(
            db,
            user=user,
            permissions=permissions,
            conversation=conversation,
            content=content,
            provider=provider,
            request_id=request_id,
        )


def _stream_turn(
    db: Session,
    *,
    user: User,
    permissions: frozenset[str],
    conversation: AIConversation,
    content: str,
    provider: AIProvider | None,
    request_id: uuid.UUID | None,
) -> Iterator[tuple[str, object]]:
    provider = provider or get_provider()
    started = time.monotonic()
    logger.info("ai.turn.started provider=%s", provider.name)
    ctx = resolve_conversation_context(db, conversation, permissions)
    existing = conv_service.recent_messages(db, conversation.id, settings.AI_HISTORY_WINDOW + 2)
    user_message = None
    if request_id:
        prior = conv_service.get_request_message(db, conversation.id, str(request_id))
        if prior:
            if prior.content != content:
                raise AIError("request_conflict", "Este intento corresponde a otro mensaje.")
            reply = conv_service.get_reply(db, conversation.id, str(prior.id))
            if reply:
                if not history_allowed(reply, permissions):
                    raise AIError(
                        "forbidden", "La respuesta ya no está disponible para tu usuario."
                    )
                yield "turn.completed", Turn(conversation, prior, reply)
                return
            if existing and existing[-1].id == prior.id:
                user_message = prior
            else:
                raise AIError(
                    "request_conflict", "Este intento ya no es el último de la conversación."
                )
    if existing and existing[-1].role == "user":
        if user_message is None:
            conv_service.remove_message(db, existing[-1])
        existing = existing[:-1]
    if user_message is None:
        user_message = conv_service.add_message(
            db,
            conversation=conversation,
            role=AIMessageRole.USER,
            content=content,
            metadata={"request_id": str(request_id)} if request_id else None,
        )
    if not existing and conversation.title == "Nueva conversación":
        conversation.title = conv_service.derive_title(content)
        db.add(conversation)
    db.commit()
    yield "turn.started", user_message
    history = [
        HistoryTurn(role=m.role, content=m.content[:4000])
        for m in existing[-settings.AI_HISTORY_WINDOW :]
        if history_allowed(m, permissions)
    ]
    executor = ToolExecutor(db, permissions)
    request = ProviderRequest(content, history, ctx, executor)
    try:
        result = None
        for event in provider.stream(request):
            if event.result is not None:
                result = event.result
            else:
                yield event.type, event.data
        if result is None or not result.text.strip() or len(result.text) > 20000:
            raise ProviderUnavailable("missing or oversized final answer")
        metadata = _sanitize_metadata(executor, result.suggestions, provider.name)
        metadata.update(
            {
                "model": provider.model[:100],
                "duration_ms": int((time.monotonic() - started) * 1000),
                "read_permissions": sorted(permissions & _READ_PERMISSIONS),
                "reply_to": str(user_message.id),
            }
        )
        assistant = conv_service.add_message(
            db,
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content=result.text.strip(),
            metadata=metadata,
        )
        db.commit()
        db.refresh(conversation)
        logger.info(
            "ai.turn.completed provider=%s tool_count=%d duration_ms=%d",
            provider.name,
            len(executor.calls),
            metadata["duration_ms"],
        )
        yield "turn.completed", Turn(conversation, user_message, assistant)
    except ProviderError as exc:
        db.rollback()
        logger.warning("ai.turn.failed code=%s", exc.code)
        raise AIError(
            exc.code,
            {
                "provider_not_configured": "El proveedor de IA no está configurado.",
                "provider_authentication_error": "No se pudo autenticar el proveedor de IA.",
                "provider_rate_limited": "El proveedor alcanzó su límite. Inténtalo más tarde.",
                "provider_timeout": "El proveedor de IA tardó demasiado en responder.",
                "tool_round_limit_exceeded": "La consulta alcanzó su límite. Acota la pregunta.",
            }.get(exc.code, "El proveedor de IA no está disponible. Inténtalo de nuevo."),
        ) from exc
    except (ToolError, SQLAlchemyError) as exc:
        db.rollback()
        raise AIError("tool_execution_failed", "No se pudo consultar la información.") from exc
    finally:
        # Generator close/disconnect never persists a partial assistant answer.
        db.rollback()
