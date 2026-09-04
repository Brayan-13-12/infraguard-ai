"""add asset relationships: canonical topology edges + relationships.* permissions

Asset Relationships & Topology milestone. PostgreSQL is the canonical source
of truth for manually-managed Asset relationships; Neo4j (``app/services/graph/``)
is a derived projection used for graph traversal, never the system of record.

Schema
------
``asset_relationships`` - one directed edge
``source_asset_id --[relationship_type]--> target_asset_id``:

* identity is the row's own UUID, never the endpoint names (renaming an Asset
  must never break a relationship);
* ``CHECK (source_asset_id != target_asset_id)`` - no self-links;
* ``UNIQUE (source_asset_id, target_asset_id, relationship_type)`` - no
  duplicate identical edges; the *inverse* pair (B -> A) is a distinct,
  independently valid row - all v1 relationship types are stored directed
  (see ``app/models/relationship.py`` for the full taxonomy + rationale);
* ``relationship_type`` is constrained to the small v1 taxonomy via CHECK,
  the same ``StrEnum`` + CHECK pattern used by every other catalog column in
  this codebase (no native PostgreSQL ENUM, no catalog table);
* **no cascade on Asset soft-delete** - Trash never touches this table.
  Moving an Asset to Trash only excludes it from live topology reads
  (``app/services/topology.py`` / ``app/services/relationships.py`` both
  filter on ``assets.deleted_at IS NULL``); restoring the Asset makes its
  relationships reappear automatically. The ``ON DELETE CASCADE`` FK only
  matters for a genuine hard delete of an ``assets`` row, which InfraGuard
  never performs.

Also widens ``audit_events.entity_type``'s CHECK to add ``'Relationship'`` -
the original audit migration's vocabulary anticipated ``User`` / ``Role`` /
``Permission`` ahead of the RBAC milestone but not this one, so relationship
CREATE/UPDATE/DELETE audit events need the constraint extended here.

Data
----
``upgrade`` re-runs :func:`app.services.rbac.seed_rbac`, which adds
``relationships.read`` / ``relationships.manage`` to the permission catalog
and grants them to the system roles (Administrator/Operator: read+manage;
Analyst/Viewer: read only). ``downgrade`` drops the table, reverts the
``entity_type`` CHECK, and leaves the additive permission rows in place
(:func:`sync_permission_catalog` is additive-only, exactly like every prior
RBAC-extending migration). Like every downgrade in this codebase, this is
validated on a disposable, empty database - reverting the CHECK would fail on
a database that already has ``Relationship`` audit rows, exactly as tightening
any CHECK would.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-05 10:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RELATIONSHIP_TYPES = (
    "depends_on",
    "hosts",
    "connects_to",
    "uses",
    "provides_service_to",
    "member_of",
)

_OLD_ENTITY_TYPES = ("Asset", "Incident", "Authentication", "User", "Role", "Permission")
_NEW_ENTITY_TYPES = (*_OLD_ENTITY_TYPES, "Relationship")


def _entity_type_check(values: tuple[str, ...]) -> str:
    return "entity_type IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    type_list = ", ".join(f"'{v}'" for v in _RELATIONSHIP_TYPES)
    op.create_table(
        "asset_relationships",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("relationship_type", sa.String(length=30), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
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
            "source_asset_id != target_asset_id",
            name=op.f("ck_asset_relationships_relationship_no_self_link"),
        ),
        sa.CheckConstraint(
            f"relationship_type IN ({type_list})",
            name=op.f("ck_asset_relationships_relationship_type_valid"),
        ),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) > 0",
            name=op.f("ck_asset_relationships_relationship_description_not_blank"),
        ),
        sa.ForeignKeyConstraint(
            ["source_asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_relationships_source_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_relationships_target_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_asset_relationships_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_relationships")),
        sa.UniqueConstraint(
            "source_asset_id",
            "target_asset_id",
            "relationship_type",
            name=op.f("uq_asset_relationships_edge"),
        ),
    )
    op.create_index(
        op.f("ix_asset_relationships_source_asset_id"),
        "asset_relationships",
        ["source_asset_id"],
    )
    op.create_index(
        op.f("ix_asset_relationships_target_asset_id"),
        "asset_relationships",
        ["target_asset_id"],
    )
    op.create_index(
        op.f("ix_asset_relationships_relationship_type"),
        "asset_relationships",
        ["relationship_type"],
    )

    op.drop_constraint(
        op.f("ck_audit_events_entity_type_valid"), "audit_events", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_audit_events_entity_type_valid"),
        "audit_events",
        _entity_type_check(_NEW_ENTITY_TYPES),
    )

    _seed()


def _seed() -> None:
    """Add ``relationships.read`` / ``relationships.manage`` to the catalog and
    the system roles (idempotent)."""
    from sqlalchemy.orm import Session

    from app.services.rbac import seed_rbac

    session = Session(bind=op.get_bind())
    seed_rbac(session)
    session.flush()


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_audit_events_entity_type_valid"), "audit_events", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_audit_events_entity_type_valid"),
        "audit_events",
        _entity_type_check(_OLD_ENTITY_TYPES),
    )

    op.drop_index(
        op.f("ix_asset_relationships_relationship_type"), table_name="asset_relationships"
    )
    op.drop_index(
        op.f("ix_asset_relationships_target_asset_id"), table_name="asset_relationships"
    )
    op.drop_index(
        op.f("ix_asset_relationships_source_asset_id"), table_name="asset_relationships"
    )
    op.drop_table("asset_relationships")
