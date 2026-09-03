"""user account lifecycle: replace is_active with account_status

Governance Phase 3 - access-request flow.

* Guards against pre-existing duplicate-email rows (impossible given the existing
  ``uq_users_email`` + ``lower(email)`` CHECK, but checked explicitly so a
  corrupt dev database fails loudly instead of silently).
* Adds ``account_status`` (``pending`` / ``active`` / ``rejected`` / ``disabled``),
  CHECK-constrained, ``server_default 'pending'`` (a public registration is a
  *request*).
* Backfills existing rows from ``is_active`` (``true`` -> ``active``,
  ``false`` -> ``disabled``) and drops ``is_active`` - ``account_status`` is now
  the single source of truth.

``downgrade`` recreates ``is_active`` from ``account_status`` - reversible.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-03 16:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUSES = ("pending", "active", "rejected", "disabled")
_CHECK = "account_status IN " + str(_STATUSES).replace('"', "'")


def _assert_no_duplicate_emails() -> None:
    rows = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT lower(trim(email)) AS e, count(*) AS n "
                "FROM users GROUP BY 1 HAVING count(*) > 1"
            )
        )
        .fetchall()
    )
    if rows:
        dupes = ", ".join(f"{r.e} (x{r.n})" for r in rows)
        raise RuntimeError(
            "Refusing to migrate: duplicate email rows exist in `users` - "
            f"{dupes}. Resolve them manually (dev: `docker compose down -v` for a "
            "clean database, or delete the surplus rows), then re-run."
        )


def upgrade() -> None:
    _assert_no_duplicate_emails()

    op.add_column(
        "users",
        sa.Column(
            "account_status",
            sa.String(length=20),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
    )
    op.execute(
        "UPDATE users SET account_status = "
        "CASE WHEN is_active THEN 'active' ELSE 'disabled' END"
    )
    op.create_check_constraint(
        op.f("ck_users_account_status_valid"), "users", _CHECK
    )
    op.drop_column("users", "is_active")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.execute("UPDATE users SET is_active = (account_status = 'active')")
    op.drop_constraint(
        op.f("ck_users_account_status_valid"), "users", type_="check"
    )
    op.drop_column("users", "account_status")
