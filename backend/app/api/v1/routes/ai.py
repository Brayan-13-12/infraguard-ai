"""AI Assistant endpoints (AI milestone - v1, **read-only**).

* ``GET    /api/v1/ai/capabilities``              - non-secret provider + tool info
* ``GET    /api/v1/ai/conversations``             - the caller's own threads (paged)
* ``POST   /api/v1/ai/conversations``             - create a thread (optional title / context)
* ``GET    /api/v1/ai/conversations/{id}``        - one own thread + its messages
* ``DELETE /api/v1/ai/conversations/{id}``        - delete an own thread (real delete)
* ``POST   /api/v1/ai/conversations/{id}/messages`` - send a message, get a grounded answer

Authorization: every endpoint requires an authenticated, active user **and** the
``ai.use`` permission. Ownership is enforced on every conversation - a 404 (never
403) is returned for another user's thread so its existence is not disclosed.
Each AI tool additionally enforces its own domain permission
(``assets.read`` / ``incidents.read`` / ``audit.read``): a Viewer cannot reach
Audit data by asking the assistant.

There is deliberately **no** endpoint that mutates operational InfraGuard data.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_permissions,
    get_current_user,
    require_permission,
    require_trusted_origin,
)
from app.core.config import settings
from app.core.ratelimit import RateLimiter
from app.db.session import get_db
from app.models.ai import AIConversation, AIMessage
from app.models.user import User
from app.schemas.ai import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    AICapabilities,
    AIEntityRef,
    AIEvidenceItem,
    AIMessageRead,
    AIToolInfo,
    ChatResponse,
    ConversationContextRead,
    ConversationCreate,
    ConversationDetail,
    ConversationListItem,
    ConversationPage,
    MessageCreate,
    MessageResponse,
)
from app.services.ai import conversations as conv_service
from app.services.ai.context import resolve_context, resolve_conversation_context
from app.services.ai.orchestrator import AIError, run_turn
from app.services.ai.providers import get_provider
from app.services.ai.tools import REGISTRY

router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user), Depends(require_permission("ai.use"))],
)

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

# Per-user message rate limit - stricter than ordinary reads (an AI turn may fan
# out to several tool queries and, optionally, an external provider call).
_message_limiter = RateLimiter(
    max_attempts=settings.AI_RATE_LIMIT_MAX_MESSAGES,
    window_seconds=settings.AI_RATE_LIMIT_WINDOW_SECONDS,
)


def _rate_limit_messages(user: User = Depends(get_current_user)) -> None:
    allowed, retry_after = _message_limiter.check(f"ai-message:{user.id}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many AI messages. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )


def reset_ai_rate_limiter() -> None:
    """Test helper."""
    _message_limiter.reset()


# --------------------------------------------------------------------------
# Serialization
# --------------------------------------------------------------------------


def _message_read(m: AIMessage) -> AIMessageRead:
    meta = m.message_metadata or {}
    return AIMessageRead(
        id=m.id,
        role=m.role,
        content=m.content,
        created_at=m.created_at,
        evidence=[AIEvidenceItem.model_validate(e) for e in meta.get("evidence", [])],
        entities=[AIEntityRef.model_validate(e) for e in meta.get("entities", [])],
        suggestions=list(meta.get("suggestions", [])),
    )


def _context_read(
    db: Session, conversation: AIConversation, permissions: frozenset[str]
) -> ConversationContextRead | None:
    resolved = resolve_conversation_context(db, conversation, permissions)
    if resolved is None:
        return None
    return ConversationContextRead(
        type=resolved.type,
        id=resolved.id,
        label=resolved.label,
        available=resolved.available,
    )


# --------------------------------------------------------------------------
# Capabilities
# --------------------------------------------------------------------------


@router.get("/capabilities", response_model=AICapabilities, summary="AI backend info (no secrets)")
def capabilities_endpoint(
    permissions: frozenset[str] = Depends(get_current_permissions),
) -> AICapabilities:
    provider = get_provider()
    return AICapabilities(
        provider=provider.name,
        model=provider.model,
        ready=provider.ready,
        message_max_length=settings.AI_MESSAGE_MAX_LENGTH,
        tools=[
            AIToolInfo(
                name=t.name,
                description=t.description,
                permission=t.permission,
                available=t.permission in permissions,
            )
            for t in REGISTRY.values()
        ],
    )


# --------------------------------------------------------------------------
# Conversations
# --------------------------------------------------------------------------


@router.get("/conversations", response_model=ConversationPage, summary="List your conversations")
def list_conversations_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    permissions: frozenset[str] = Depends(get_current_permissions),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ConversationPage:
    rows, total = conv_service.list_conversations(
        db, user_id=user.id, page=page, page_size=page_size
    )
    total_pages = (total + page_size - 1) // page_size if total else 0
    return ConversationPage(
        items=[
            ConversationListItem(
                id=r.conversation.id,
                title=r.conversation.title,
                context=_context_read(db, r.conversation, permissions),
                message_count=r.message_count,
                created_at=r.conversation.created_at,
                updated_at=r.conversation.updated_at,
            )
            for r in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.post(
    "/conversations",
    response_model=ConversationDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a conversation",
    dependencies=[Depends(require_trusted_origin)],
)
def create_conversation_endpoint(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    permissions: frozenset[str] = Depends(get_current_permissions),
) -> ConversationDetail:
    context_type: str | None = None
    context_id: uuid.UUID | None = None
    if payload.context is not None and not payload.context.is_empty:
        resolved = resolve_context(
            db,
            context_type="asset" if payload.context.asset_id else "incident",
            context_id=payload.context.asset_id or payload.context.incident_id,
            permissions=permissions,
        )
        if resolved is None or not resolved.available:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Context entity not found or not accessible",
            )
        context_type, context_id = resolved.type, resolved.id

    conv = conv_service.create_conversation(
        db,
        user_id=user.id,
        title=payload.title,
        context_type=context_type,
        context_id=context_id,
    )
    db.commit()
    db.refresh(conv)
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        context=_context_read(db, conv, permissions),
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetail,
    summary="Get one conversation with its messages",
    responses={404: {"model": MessageResponse}},
)
def get_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    permissions: frozenset[str] = Depends(get_current_permissions),
) -> ConversationDetail:
    conv = conv_service.get_owned_conversation(db, conversation_id=conversation_id, user_id=user.id)
    if conv is None:
        raise _NOT_FOUND
    messages = conv_service.get_messages(db, conv.id)
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        context=_context_read(db, conv, permissions),
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[_message_read(m) for m in messages],
    )


@router.delete(
    "/conversations/{conversation_id}",
    response_model=MessageResponse,
    summary="Delete one of your conversations",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin)],
)
def delete_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    conv = conv_service.get_owned_conversation(db, conversation_id=conversation_id, user_id=user.id)
    if conv is None:
        raise _NOT_FOUND
    conv_service.delete_conversation(db, conv)
    db.commit()
    return MessageResponse(detail="Conversation deleted")


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ChatResponse,
    summary="Send a message and receive a grounded answer",
    responses={
        404: {"model": MessageResponse},
        429: {"model": MessageResponse, "description": "Too many AI messages"},
        503: {"description": "AI provider unavailable (recoverable - retry)"},
    },
    dependencies=[Depends(require_trusted_origin), Depends(_rate_limit_messages)],
)
def send_message_endpoint(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    permissions: frozenset[str] = Depends(get_current_permissions),
) -> ChatResponse:
    conv = conv_service.get_owned_conversation(db, conversation_id=conversation_id, user_id=user.id)
    if conv is None:
        raise _NOT_FOUND

    try:
        turn = run_turn(
            db,
            user=user,
            permissions=permissions,
            conversation=conv,
            content=payload.content,
        )
    except AIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return ChatResponse(
        conversation_id=turn.conversation.id,
        title=turn.conversation.title,
        user_message=_message_read(turn.user_message),
        assistant_message=_message_read(turn.assistant_message),
    )
