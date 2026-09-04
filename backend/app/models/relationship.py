"""``AssetRelationship`` - a directed edge between two Assets (Topology milestone).

PostgreSQL is the **canonical** source of truth for manually-managed asset
relationships; Neo4j (``app/services/graph/``) is a *derived* projection used
for graph traversal queries. Nothing here ever assumes Neo4j is present.

Design notes
------------
* **Identity is the relationship's own UUID**, never ``(source, target)``
  names - renaming an Asset must never break a relationship (see
  :mod:`app.services.relationships`).
* **All v1 relationship types are stored directed** (``source_asset_id`` ->
  ``target_asset_id``), even for types a user perceives as symmetric
  (``connects_to``). This keeps the model and its invariants simple; the
  frontend presents each type with a natural forward/inverse label pair (see
  :data:`RELATIONSHIP_TYPE_CATALOG`). ``A connects_to B`` and
  ``B connects_to A`` are therefore **not** automatically deduplicated - a
  distinct edge in each direction may legitimately exist.
* **Soft-deleted Assets are not cascaded.** Moving an Asset to Trash does
  **not** delete its relationships - only the live topology (Postgres
  traversal + Neo4j projection) excludes it. Restoring the Asset makes the
  same relationship rows visible again, byte-for-byte. This is why there is
  deliberately no ``ondelete="CASCADE"`` in the direction of a *soft* delete -
  soft delete never touches this table at all, it only sets ``deleted_at`` on
  ``assets``. The `ForeignKey` `ondelete="CASCADE"` below only fires on a
  genuine hard delete of the ``assets`` row, which InfraGuard never performs.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RelationshipType(enum.StrEnum):
    """Intentionally small v1 taxonomy - see :data:`RELATIONSHIP_TYPE_CATALOG`
    for the full semantics (labels, direction, impact propagation) of each."""

    DEPENDS_ON = "depends_on"
    HOSTS = "hosts"
    CONNECTS_TO = "connects_to"
    USES = "uses"
    PROVIDES_SERVICE_TO = "provides_service_to"
    MEMBER_OF = "member_of"


DESCRIPTION_MAX_LENGTH = 500


@dataclass(frozen=True, slots=True)
class RelationshipTypeMeta:
    code: str
    #: Spanish label for the forward (source -> target) direction.
    label_es: str
    #: Spanish label for the inverse (target's-eyes-view) direction, used when
    #: grouping a relationship under the *target* asset's "incoming" section.
    inverse_label_es: str
    description_es: str
    #: Grouping used only for documentation / future filtering UI.
    category: str
    #: Whether a failure/degradation of the *upstream* side of this edge is
    #: considered to propagate to the *downstream* side for impact analysis
    #: (``app/services/topology.py::compute_impact``). Purely informational
    #: types (``connects_to``, ``member_of``) do not propagate.
    propagates_impact: bool
    #: When ``propagates_impact`` is True: "reverse" means the *target* of the
    #: edge going down impacts the *source* (e.g. ``A depends_on B`` - B going
    #: down impacts A, so from B we walk edges where B is the *target*).
    #: "forward" means the *source* going down impacts the *target* (e.g.
    #: ``A hosts B`` - A going down impacts B, so from A we walk edges where A
    #: is the *source*). ``None`` when ``propagates_impact`` is False.
    impact_direction: str | None


#: Single source of truth for relationship-type semantics - drives backend
#: validation, the topology impact traversal, and the frontend catalog labels
#: (mirrored in ``frontend/src/components/assets/relationships/catalog.ts``).
#: Direction semantics (§34): if "A depends_on B" then B is *upstream* of A and
#: A is *downstream* of B - the thing you depend on is upstream of you.
RELATIONSHIP_TYPE_CATALOG: dict[str, RelationshipTypeMeta] = {
    m.code: m
    for m in (
        RelationshipTypeMeta(
            RelationshipType.DEPENDS_ON.value,
            "Depende de",
            "Es una dependencia de",
            "El activo origen necesita al activo destino para funcionar.",
            "dependency",
            True,
            "reverse",
        ),
        RelationshipTypeMeta(
            RelationshipType.USES.value,
            "Usa",
            "Es utilizado por",
            "El activo origen utiliza al activo destino (p. ej. una caché o una cola).",
            "dependency",
            True,
            "reverse",
        ),
        RelationshipTypeMeta(
            RelationshipType.HOSTS.value,
            "Aloja",
            "Está alojado en",
            "El activo origen aloja físicamente o lógicamente al activo destino.",
            "hosting",
            True,
            "forward",
        ),
        RelationshipTypeMeta(
            RelationshipType.PROVIDES_SERVICE_TO.value,
            "Provee servicio a",
            "Recibe servicio de",
            "El activo origen provee un servicio consumido por el activo destino.",
            "service",
            True,
            "forward",
        ),
        RelationshipTypeMeta(
            RelationshipType.CONNECTS_TO.value,
            "Conectado con",
            "Conectado con",
            "Conectividad de red entre ambos activos (informativo).",
            "network",
            False,
            None,
        ),
        RelationshipTypeMeta(
            RelationshipType.MEMBER_OF.value,
            "Es miembro de",
            "Tiene como miembro a",
            "El activo origen forma parte lógicamente del activo destino "
            "(p. ej. un nodo de un clúster).",
            "grouping",
            False,
            None,
        ),
    )
}

#: Relationship types whose failure/degradation is considered to propagate for
#: impact analysis (`app/services/topology.py`).
PROPAGATING_RELATIONSHIP_TYPES: frozenset[str] = frozenset(
    m.code for m in RELATIONSHIP_TYPE_CATALOG.values() if m.propagates_impact
)


def _relationship_type_check() -> CheckConstraint:
    values = ", ".join(f"'{v}'" for v in RELATIONSHIP_TYPE_CATALOG)
    return CheckConstraint(f"relationship_type IN ({values})", name="relationship_type_valid")


class AssetRelationship(Base):
    """A directed edge ``source_asset_id --[relationship_type]--> target_asset_id``.

    Identity is ``id`` (a UUID) - never the source/target names. Uniqueness is
    on the natural key ``(source_asset_id, target_asset_id, relationship_type)``
    so the exact same edge cannot be created twice, while the *inverse* pair
    (``B -> A``) is a distinct, independently valid row (§8).
    """

    __tablename__ = "asset_relationships"
    __table_args__ = (
        CheckConstraint("source_asset_id != target_asset_id", name="relationship_no_self_link"),
        _relationship_type_check(),
        CheckConstraint(
            "description IS NULL OR char_length(description) > 0",
            name="relationship_description_not_blank",
        ),
        UniqueConstraint(
            "source_asset_id",
            "target_asset_id",
            "relationship_type",
            name="uq_asset_relationships_edge",
        ),
        Index("ix_asset_relationships_source_asset_id", "source_asset_id"),
        Index("ix_asset_relationships_target_asset_id", "target_asset_id"),
        Index("ix_asset_relationships_relationship_type", "relationship_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    # No ondelete="CASCADE" toward a *soft* delete - Trash never removes the
    # assets row. This FK only matters for referential integrity; InfraGuard
    # never hard-deletes an Asset, so it never actually fires.
    source_asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    target_asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    relationship_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return (
            f"<AssetRelationship id={self.id!s} {self.source_asset_id!s} "
            f"-[{self.relationship_type}]-> {self.target_asset_id!s}>"
        )
