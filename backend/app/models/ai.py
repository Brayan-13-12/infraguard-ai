"""AI Assistant conversation persistence (AI milestone - v1, read-only).

Two tables, following the same conventions as the rest of the domain:

``ai_conversations``
  one row per chat thread. **Owned by exactly one user** (``user_id``); an
  administrator is *not* implicitly allowed to read another user's threads -
  ownership is enforced in the service layer. An optional entity ``context``
  (a single asset or incident) is stored so the workspace can show a
  "Contexto: prod-api-01" banner and every turn can ground on that entity - the
  ids are re-validated and permission-checked on every use.

``ai_messages``
  one row per turn. ``role`` is ``user`` or ``assistant`` only - internal
  tool/system turns are never persisted. ``message_metadata`` holds a **bounded,
  sanitized** structure (evidence sources + entity references + suggested
  follow-ups) - never a raw provider payload, prompt, token, cookie or secret
  (see :mod:`app.services.ai.orchestrator`).

Deleting a conversation is a **real** delete (``ON DELETE CASCADE`` to its
messages). Private AI history does not go through the operational Trash module.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

TITLE_MAX_LENGTH = 120
CONTENT_MAX_LENGTH = 20_000


class AIMessageRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class AIContextType(enum.StrEnum):
    ASSET = "asset"
    INCIDENT = "incident"


_ROLE_IN = ", ".join(f"'{r.value}'" for r in AIMessageRole)
_CONTEXT_IN = ", ".join(f"'{c.value}'" for c in AIContextType)


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (
        CheckConstraint("char_length(title) > 0", name="title_not_empty"),
        CheckConstraint(
            f"context_type IS NULL OR context_type IN ({_CONTEXT_IN})",
            name="context_type_valid",
        ),
        CheckConstraint(
            "(context_type IS NULL) = (context_id IS NULL)",
            name="context_pair_consistent",
        ),
        # "my conversations, most recent first" - the only list query.
        Index("ix_ai_conversations_user_id_updated_at", "user_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH), nullable=False)

    #: Optional entity context (asset / incident). A loose reference (no FK) - the
    #: entity may later be trashed; the service re-checks it on every turn.
    context_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    context_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    messages: Mapped[list[AIMessage]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AIMessage.created_at",
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<AIConversation id={self.id!s} user={self.user_id!s} title={self.title!r}>"


class AIMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (
        CheckConstraint("char_length(content) > 0", name="content_not_empty"),
        CheckConstraint(f"role IN ({_ROLE_IN})", name="role_valid"),
        Index("ix_ai_messages_conversation_id_created_at", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    #: Bounded, sanitized structure for assistant turns: ``{"evidence": [...],
    #: "entities": [...], "suggestions": [...]}``. Never a provider payload,
    #: hidden prompt, reasoning trace or secret.
    message_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    #: A Python-side wall-clock default (not the DB transaction clock) so turns
    #: added within one request/transaction keep a stable, monotonic order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )

    conversation: Mapped[AIConversation] = relationship(back_populates="messages")

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<AIMessage id={self.id!s} role={self.role} conv={self.conversation_id!s}>"
