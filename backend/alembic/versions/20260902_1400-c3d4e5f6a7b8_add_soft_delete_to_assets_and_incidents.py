"""add soft delete to assets and incidents

Governance & Administration - Phase 2 (Trash / Restore). Adds recoverable
deletion metadata to ``assets`` and ``incidents``:

  * ``deleted_at``  timezone-aware timestamp, ``NULL`` while the record is live.
                    A value means the record is in Trash: every normal query,
                    summary, picker and dropdown filters it out; the dedicated
                    Trash API is the only path that returns it.
  * ``deleted_by``  FK -> users.id (``SET NULL``) - a snapshot of who moved the
                    record to Trash. Nullable so removing a user never blocks.

A **partial** index on ``deleted_at`` (``WHERE deleted_at IS NOT NULL``) keeps
the common "live records" scans free of index bloat while making the small Trash
set cheap to list.

Nothing is physically deleted and no data is rewritten - existing rows get
``deleted_at = NULL`` (live), exactly the pre-migration behaviour.

``downgrade`` drops the two columns and their index/FK - reversible.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-02 14:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("assets", "incidents")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.add_column(
            table,
            sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            op.f(f"fk_{table}_deleted_by_users"),
            table,
            "users",
            ["deleted_by"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            f"ix_{table}_deleted_at",
            table,
            ["deleted_at"],
            postgresql_where=sa.text("deleted_at IS NOT NULL"),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_constraint(op.f(f"fk_{table}_deleted_by_users"), table, type_="foreignkey")
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")
