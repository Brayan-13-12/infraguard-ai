"""add ai assistant: conversations, messages + ai.use permission

AI Assistant milestone - v1 (read-only grounded intelligence).

Schema
------
* ``ai_conversations`` - one chat thread, owned by exactly one user
  (``user_id`` -> ``users.id`` ``ON DELETE CASCADE``). Optional single-entity
  ``context`` (``asset`` / ``incident``) as a loose reference (no FK) with a
  CHECK that keeps ``context_type`` / ``context_id`` set-together.
* ``ai_messages`` - one turn (``role`` ``user`` / ``assistant``), ``content``,
  and a bounded sanitized ``metadata`` JSONB. ``ON DELETE CASCADE`` from the
  conversation - deleting a thread really deletes its messages (private AI
  history does not use the operational Trash module).

Data (deterministic, idempotent)
--------------------------------
``upgrade`` re-runs :func:`app.services.rbac.seed_rbac`, which adds the new
``ai.use`` permission to the catalog and grants it to the Administrator /
Operator / Analyst / Viewer system roles. ``ai.use`` gates *access to the AI
Assistant*; each AI tool still enforces the underlying domain permission
(``assets.read`` / ``incidents.read`` / ``audit.read``).

``downgrade`` drops both tables (children first). The ``ai.use`` permission row
is intentionally left in place - :func:`sync_permission_catalog` is additive and
never orphans ``role_permissions``; a re-``upgrade`` is a no-op.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-04 10:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("context_type", sa.String(length=16), nullable=True),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(title) > 0", name=op.f("ck_ai_conversations_title_not_empty")
        ),
        sa.CheckConstraint(
            "context_type IS NULL OR context_type IN ('asset', 'incident')",
            name=op.f("ck_ai_conversations_context_type_valid"),
        ),
        sa.CheckConstraint(
            "(context_type IS NULL) = (context_id IS NULL)",
            name=op.f("ck_ai_conversations_context_pair_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_conversations_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_conversations")),
    )
    op.create_index(
        op.f("ix_ai_conversations_user_id_updated_at"),
        "ai_conversations",
        ["user_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "ai_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(content) > 0", name=op.f("ck_ai_messages_content_not_empty")
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')", name=op.f("ck_ai_messages_role_valid")
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            name=op.f("fk_ai_messages_conversation_id_ai_conversations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_messages")),
    )
    op.create_index(
        op.f("ix_ai_messages_conversation_id_created_at"),
        "ai_messages",
        ["conversation_id", "created_at"],
        unique=False,
    )

    _seed()


def _seed() -> None:
    """Add ``ai.use`` to the catalog and the system roles (idempotent)."""
    from sqlalchemy.orm import Session

    from app.services.rbac import seed_rbac

    session = Session(bind=op.get_bind())
    seed_rbac(session)
    session.flush()


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_messages_conversation_id_created_at"), table_name="ai_messages"
    )
    op.drop_table("ai_messages")
    op.drop_index(
        op.f("ix_ai_conversations_user_id_updated_at"), table_name="ai_conversations"
    )
    op.drop_table("ai_conversations")
