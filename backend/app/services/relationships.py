"""Asset relationship persistence and query logic (Topology milestone).

PostgreSQL is canonical here - this module is the only place that reads or
writes ``asset_relationships``. Every normal query joins the two endpoint
Assets and excludes a relationship where **either side is currently
trashed** (mirrors the ``_live()`` convention in ``app/services/assets.py``).
Because that is a read-time filter rather than a flag on the relationship
row itself, restoring a trashed Asset makes its relationships reappear
automatically - nothing needs to be "reactivated" (§50).

Nothing here commits; the calling route owns the transaction, exactly like
every other service in this codebase.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.asset import Asset
from app.models.relationship import AssetRelationship, RelationshipType
from app.schemas.relationship import RelationshipCreate, RelationshipUpdate

Source = aliased(Asset, name="source_asset")
Target = aliased(Asset, name="target_asset")


class DuplicateRelationshipError(Exception):
    """The exact ``(source, target, type)`` edge already exists."""


class AssetNotFoundError(Exception):
    def __init__(self, asset_id: uuid.UUID) -> None:
        super().__init__(f"asset {asset_id} not found")
        self.asset_id = asset_id


class AssetTrashedError(Exception):
    """A relationship cannot be created against a trashed Asset (§12)."""

    def __init__(self, asset_id: uuid.UUID) -> None:
        super().__init__(f"asset {asset_id} is in Trash")
        self.asset_id = asset_id


def _live() -> ColumnElement[bool]:
    return Asset.deleted_at.is_(None)


def both_endpoints_live() -> ColumnElement[bool]:
    return and_(Source.deleted_at.is_(None), Target.deleted_at.is_(None))


@dataclass(frozen=True, slots=True)
class RelationshipQuery:
    source_asset_id: uuid.UUID | None = None
    target_asset_id: uuid.UUID | None = None
    #: Either endpoint - combined with ``direction`` below.
    asset_id: uuid.UUID | None = None
    direction: str = "both"  # "outgoing" | "incoming" | "both" (relative to asset_id)
    relationship_type: tuple[RelationshipType, ...] = ()
    #: When ``asset_id`` is set, these filter the *other* endpoint (relative
    #: to the focused Asset). When ``asset_id`` is unset (the global
    #: Dependencias module), they filter *either* endpoint - a relationship
    #: matches if its source or its target has the given value.
    environment: str | None = None
    criticality: str | None = None
    asset_type: str | None = None
    #: Free-text match against source/target name, hostname, or the
    #: relationship's own description (global module search - §14).
    search: str | None = None
    page: int = 1
    page_size: int = 50


def base_relationship_select() -> Select:
    return (
        select(AssetRelationship, Source, Target)
        .join(Source, Source.id == AssetRelationship.source_asset_id)
        .join(Target, Target.id == AssetRelationship.target_asset_id)
    )


def _conditions(q: RelationshipQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [both_endpoints_live()]
    if q.source_asset_id is not None:
        conds.append(AssetRelationship.source_asset_id == q.source_asset_id)
    if q.target_asset_id is not None:
        conds.append(AssetRelationship.target_asset_id == q.target_asset_id)
    if q.relationship_type:
        conds.append(
            AssetRelationship.relationship_type.in_([t.value for t in q.relationship_type])
        )

    other = None
    if q.asset_id is not None:
        if q.direction == "outgoing":
            conds.append(AssetRelationship.source_asset_id == q.asset_id)
            other = Target
        elif q.direction == "incoming":
            conds.append(AssetRelationship.target_asset_id == q.asset_id)
            other = Source
        else:
            conds.append(
                or_(
                    AssetRelationship.source_asset_id == q.asset_id,
                    AssetRelationship.target_asset_id == q.asset_id,
                )
            )

    # Relative to a focused Asset: filter the *other* endpoint only. In the
    # global module (no asset_id) these are general filters - a relationship
    # matches if *either* endpoint satisfies them.
    if other is not None:
        if q.environment:
            conds.append(other.environment == q.environment)
        if q.criticality:
            conds.append(other.criticality == q.criticality)
        if q.asset_type:
            conds.append(other.asset_type == q.asset_type)
    else:
        if q.environment:
            conds.append(
                or_(Source.environment == q.environment, Target.environment == q.environment)
            )
        if q.criticality:
            conds.append(
                or_(Source.criticality == q.criticality, Target.criticality == q.criticality)
            )
        if q.asset_type:
            conds.append(or_(Source.asset_type == q.asset_type, Target.asset_type == q.asset_type))

    if q.search:
        term = f"%{q.search.strip()}%"
        conds.append(
            or_(
                Source.name.ilike(term),
                Source.hostname.ilike(term),
                Target.name.ilike(term),
                Target.hostname.ilike(term),
                AssetRelationship.description.ilike(term),
            )
        )

    return conds


def list_relationships(
    db: Session, q: RelationshipQuery
) -> tuple[list[tuple[AssetRelationship, Asset, Asset]], int]:
    """``([(relationship, source_asset, target_asset), ...], total)``.

    A single query with both endpoint Assets already joined - no N+1 when the
    caller renders a page of relationship cards.
    """
    conds = _conditions(q)
    total = db.execute(
        select(func.count()).select_from(base_relationship_select().where(*conds).subquery())
    ).scalar_one()

    rows = db.execute(
        base_relationship_select()
        .where(*conds)
        .order_by(AssetRelationship.created_at.desc(), AssetRelationship.id.desc())
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    ).all()
    return [(r[0], r[1], r[2]) for r in rows], int(total)


def grouped_for_asset(
    db: Session, asset_id: uuid.UUID
) -> tuple[
    list[tuple[AssetRelationship, Asset, Asset]], list[tuple[AssetRelationship, Asset, Asset]]
]:
    """``(outgoing, incoming)`` - every live relationship of one Asset, each
    edge with both endpoint Assets attached. Two bounded queries, no N+1."""
    outgoing = db.execute(
        base_relationship_select()
        .where(both_endpoints_live(), AssetRelationship.source_asset_id == asset_id)
        .order_by(AssetRelationship.relationship_type.asc(), Target.name.asc())
    ).all()
    incoming = db.execute(
        base_relationship_select()
        .where(both_endpoints_live(), AssetRelationship.target_asset_id == asset_id)
        .order_by(AssetRelationship.relationship_type.asc(), Source.name.asc())
    ).all()
    return [(r[0], r[1], r[2]) for r in outgoing], [(r[0], r[1], r[2]) for r in incoming]


def get_relationship(
    db: Session, relationship_id: uuid.UUID
) -> tuple[AssetRelationship, Asset, Asset] | None:
    row = db.execute(
        base_relationship_select().where(AssetRelationship.id == relationship_id)
    ).first()
    return (row[0], row[1], row[2]) if row else None


def _require_live_asset(db: Session, asset_id: uuid.UUID) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise AssetNotFoundError(asset_id)
    if asset.deleted_at is not None:
        raise AssetTrashedError(asset_id)
    return asset


def create_relationship(
    db: Session, data: RelationshipCreate, *, created_by: uuid.UUID
) -> AssetRelationship:
    """Validate both endpoints (exist + live), reject a duplicate edge, then
    insert. ``source != target`` is already enforced by the schema (and, in
    depth, by the database ``CHECK``)."""
    _require_live_asset(db, data.source_asset_id)
    _require_live_asset(db, data.target_asset_id)

    exists = db.execute(
        select(AssetRelationship.id).where(
            AssetRelationship.source_asset_id == data.source_asset_id,
            AssetRelationship.target_asset_id == data.target_asset_id,
            AssetRelationship.relationship_type == data.relationship_type.value,
        )
    ).first()
    if exists is not None:
        raise DuplicateRelationshipError(
            f"a {data.relationship_type.value!r} relationship between these assets already exists"
        )

    rel = AssetRelationship(
        source_asset_id=data.source_asset_id,
        target_asset_id=data.target_asset_id,
        relationship_type=data.relationship_type.value,
        description=data.description,
        created_by=created_by,
    )
    db.add(rel)
    db.flush()
    db.refresh(rel)
    return rel


def update_relationship(
    db: Session, relationship: AssetRelationship, data: RelationshipUpdate
) -> AssetRelationship:
    changes = data.model_dump(mode="json", exclude_unset=True)
    if not changes:
        return relationship
    if "relationship_type" in changes:
        new_type = changes["relationship_type"]
        # Re-validate the uniqueness invariant against the (possibly) new type.
        exists = db.execute(
            select(AssetRelationship.id).where(
                AssetRelationship.id != relationship.id,
                AssetRelationship.source_asset_id == relationship.source_asset_id,
                AssetRelationship.target_asset_id == relationship.target_asset_id,
                AssetRelationship.relationship_type == new_type,
            )
        ).first()
        if exists is not None:
            raise DuplicateRelationshipError(
                f"a {new_type!r} relationship between these assets already exists"
            )
        relationship.relationship_type = new_type
    if "description" in changes:
        relationship.description = changes["description"]
    db.add(relationship)
    db.flush()
    db.refresh(relationship)
    return relationship


def delete_relationship(db: Session, relationship: AssetRelationship) -> None:
    """Real delete - relationship edges are not Trash-eligible entities (§14)."""
    db.delete(relationship)
    db.flush()


def global_summary(db: Session) -> dict[str, int]:
    """Restrained stats for the global Dependencias module header: total live
    relationships, distinct connected Assets, the taxonomy size, and how many
    live Assets have no relationship at all (one cheap extra count - §22)."""
    live_edges = (
        select(AssetRelationship)
        .join(Source, Source.id == AssetRelationship.source_asset_id)
        .join(Target, Target.id == AssetRelationship.target_asset_id)
        .where(both_endpoints_live())
        .subquery()
    )

    total = db.execute(select(func.count()).select_from(live_edges)).scalar_one()

    source_ids = select(live_edges.c.source_asset_id.label("id"))
    target_ids = select(live_edges.c.target_asset_id.label("id"))
    connected_assets = db.execute(
        select(func.count()).select_from(source_ids.union(target_ids).subquery())
    ).scalar_one()

    total_live_assets = db.execute(
        select(func.count()).select_from(Asset).where(_live())
    ).scalar_one()

    return {
        "total": int(total),
        "connected_assets": int(connected_assets),
        "relationship_types": len(RelationshipType),
        "assets_without_relationships": max(0, int(total_live_assets) - int(connected_assets)),
    }


def relationship_counts(db: Session, asset_id: uuid.UUID) -> tuple[int, int]:
    """``(outgoing, incoming)`` counts for one Asset, live endpoints only."""
    outgoing = db.execute(
        select(func.count())
        .select_from(AssetRelationship)
        .join(Target, Target.id == AssetRelationship.target_asset_id)
        .join(Source, Source.id == AssetRelationship.source_asset_id)
        .where(both_endpoints_live(), AssetRelationship.source_asset_id == asset_id)
    ).scalar_one()
    incoming = db.execute(
        select(func.count())
        .select_from(AssetRelationship)
        .join(Target, Target.id == AssetRelationship.target_asset_id)
        .join(Source, Source.id == AssetRelationship.source_asset_id)
        .where(both_endpoints_live(), AssetRelationship.target_asset_id == asset_id)
    ).scalar_one()
    return int(outgoing), int(incoming)
