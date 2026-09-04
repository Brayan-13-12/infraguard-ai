"""AI conversation persistence. Ownership is enforced here, not in the route.

Nothing commits - the route owns the transaction (same rule as every other
service). A user may only ever see or mutate their **own** conversations; an
administrator has no implicit access to other users' private threads.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.ai import (
    TITLE_MAX_LENGTH,
    AIConversation,
    AIMessage,
    AIMessageRole,
)

_DEFAULT_TITLE = "Nueva conversación"


@dataclass(frozen=True, slots=True)
class ConversationListRow:
    conversation: AIConversation
    message_count: int


def derive_title(first_message: str) -> str:
    """Deterministic, no-LLM title from the first user message."""
    text = re.sub(r"\s+", " ", first_message).strip().strip("¿?¡!.,;:")
    if not text:
        return _DEFAULT_TITLE
    if len(text) <= TITLE_MAX_LENGTH:
        title = text
    else:
        cut = text[: TITLE_MAX_LENGTH - 1]
        title = cut[: cut.rfind(" ")] if " " in cut else cut
        title = f"{title}…"
    return title[:1].upper() + title[1:]


def create_conversation(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str | None,
    context_type: str | None = None,
    context_id: uuid.UUID | None = None,
) -> AIConversation:
    conv = AIConversation(
        user_id=user_id,
        title=(title.strip()[:TITLE_MAX_LENGTH] if title and title.strip() else _DEFAULT_TITLE),
        context_type=context_type,
        context_id=context_id,
    )
    db.add(conv)
    db.flush()
    db.refresh(conv)
    return conv


def list_conversations(
    db: Session, *, user_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[ConversationListRow], int]:
    total = db.execute(
        select(func.count()).select_from(AIConversation).where(AIConversation.user_id == user_id)
    ).scalar_one()

    count_sq = (
        select(func.count(AIMessage.id))
        .where(AIMessage.conversation_id == AIConversation.id)
        .correlate(AIConversation)
        .scalar_subquery()
    )
    rows = db.execute(
        select(AIConversation, count_sq.label("message_count"))
        .where(AIConversation.user_id == user_id)
        .order_by(AIConversation.updated_at.desc(), AIConversation.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return [ConversationListRow(r[0], int(r[1])) for r in rows], int(total)


def get_owned_conversation(
    db: Session, *, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> AIConversation | None:
    """The conversation **iff** it exists and belongs to ``user_id`` (else None -
    the route returns 404, never distinguishing "not found" from "not yours")."""
    return db.execute(
        select(AIConversation).where(
            AIConversation.id == conversation_id,
            AIConversation.user_id == user_id,
        )
    ).scalar_one_or_none()


def get_messages(db: Session, conversation_id: uuid.UUID) -> list[AIMessage]:
    return list(
        db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
            .order_by(AIMessage.created_at.asc(), AIMessage.id.asc())
        )
        .scalars()
        .all()
    )


def recent_messages(db: Session, conversation_id: uuid.UUID, limit: int) -> list[AIMessage]:
    rows = list(
        db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
            .order_by(AIMessage.created_at.desc(), AIMessage.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return list(reversed(rows))


def add_message(
    db: Session,
    *,
    conversation: AIConversation,
    role: AIMessageRole,
    content: str,
    metadata: dict | None = None,
) -> AIMessage:
    msg = AIMessage(
        conversation_id=conversation.id,
        role=role.value,
        content=content,
        message_metadata=metadata,
    )
    db.add(msg)
    conversation.updated_at = datetime.now(UTC)
    db.add(conversation)
    db.flush()
    db.refresh(msg)
    return msg


def remove_message(db: Session, message: AIMessage) -> None:
    """Drop a single message.

    Used by the orchestrator to sweep a *dangling* user turn - one whose
    provider call failed and left no assistant reply - when the next turn
    starts, so a retry regenerates that turn instead of stacking a duplicate
    user message. Only ever removes a trailing unanswered ``user`` message.
    """
    db.execute(delete(AIMessage).where(AIMessage.id == message.id))
    db.flush()


def delete_conversation(db: Session, conversation: AIConversation) -> None:
    """Real delete (cascades to messages). Private AI history is not Trash."""
    db.execute(delete(AIMessage).where(AIMessage.conversation_id == conversation.id))
    db.execute(delete(AIConversation).where(AIConversation.id == conversation.id))
    db.flush()
