"""Asset persistence and query logic.

Kept free of HTTP concerns. All queries are built with the SQLAlchemy Core
expression API - no hand-assembled SQL strings, and ``ILIKE`` search terms are
escaped so ``%`` / ``_`` / ``\\`` in user input are treated literally.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetStatus, AssetType, Criticality, Environment
from app.schemas.asset import AssetCreate, AssetUpdate


def _escape_like(term: str) -> str:
    """Escape LIKE/ILIKE wildcards so the term matches literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@dataclass(frozen=True, slots=True)
class AssetQuery:
    search: str | None = None
    asset_type: AssetType | None = None
    environment: Environment | None = None
    # ``criticality`` and ``status`` accept multiple values (``... IN (...)``);
    # an empty tuple means "no filter". A single value still works, so existing
    # ``?status=Offline`` URLs are unchanged.
    criticality: tuple[Criticality, ...] = ()
    status: tuple[AssetStatus, ...] = ()
    is_active: bool | None = None
    page: int = 1
    page_size: int = 20


def _conditions(q: AssetQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    if q.asset_type is not None:
        conds.append(Asset.asset_type == q.asset_type.value)
    if q.environment is not None:
        conds.append(Asset.environment == q.environment.value)
    if q.criticality:
        conds.append(Asset.criticality.in_([c.value for c in q.criticality]))
    if q.status:
        conds.append(Asset.status.in_([s.value for s in q.status]))
    if q.is_active is not None:
        conds.append(Asset.is_active.is_(q.is_active))

    term = (q.search or "").strip()
    if term:
        pattern = f"%{_escape_like(term)}%"
        conds.append(
            or_(
                Asset.name.ilike(pattern, escape="\\"),
                Asset.hostname.ilike(pattern, escape="\\"),
                Asset.owner.ilike(pattern, escape="\\"),
                Asset.ip_address.ilike(pattern, escape="\\"),
            )
        )
    return conds


def list_assets(db: Session, q: AssetQuery) -> tuple[list[Asset], int]:
    """Return ``(page_items, total_matching)`` for the given query."""
    conds = _conditions(q)

    total = db.execute(
        select(func.count()).select_from(Asset).where(*conds)
    ).scalar_one()

    rows = (
        db.execute(
            select(Asset)
            .where(*conds)
            .order_by(Asset.updated_at.desc(), Asset.id.desc())
            .offset((q.page - 1) * q.page_size)
            .limit(q.page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def _grouped_counts(
    db: Session, column: ColumnElement[str], enum_cls: type
) -> dict[str, int]:
    """``{catalog_value: count}`` for one column, every catalog key present."""
    counts = {member.value: 0 for member in enum_cls}
    rows = db.execute(
        select(column, func.count()).select_from(Asset).group_by(column)
    ).all()
    for value, count in rows:
        if value in counts:
            counts[value] = int(count)
    return counts


def get_asset_summary(db: Session) -> dict[str, object]:
    """Aggregate inventory counts in a handful of ``GROUP BY`` queries.

    Every catalog key appears in each breakdown even when its count is zero, so
    the Dashboard can render a stable set of KPIs and chart slices.
    """
    total, active = db.execute(
        select(
            func.count(),
            func.count().filter(Asset.is_active.is_(True)),
        ).select_from(Asset)
    ).one()
    total, active = int(total), int(active)
    return {
        "total": total,
        "active": active,
        "inactive": total - active,
        "by_criticality": _grouped_counts(db, Asset.criticality, Criticality),
        "by_status": _grouped_counts(db, Asset.status, AssetStatus),
        "by_environment": _grouped_counts(db, Asset.environment, Environment),
        "by_type": _grouped_counts(db, Asset.asset_type, AssetType),
    }


def get_asset(db: Session, asset_id: uuid.UUID) -> Asset | None:
    return db.get(Asset, asset_id)


def create_asset(db: Session, data: AssetCreate) -> Asset:
    asset = Asset(**data.model_dump(mode="json"))
    db.add(asset)
    db.flush()
    db.refresh(asset)
    return asset


def update_asset(db: Session, asset: Asset, data: AssetUpdate) -> Asset:
    """Apply only the fields the client actually sent."""
    changes = data.model_dump(mode="json", exclude_unset=True)
    if not changes:
        return asset
    for field, value in changes.items():
        setattr(asset, field, value)
    db.add(asset)
    db.flush()
    db.refresh(asset)
    return asset


def set_active(db: Session, asset: Asset, *, is_active: bool) -> Asset:
    """Idempotent lifecycle toggle. ``updated_at`` only moves on a real change."""
    if asset.is_active != is_active:
        asset.is_active = is_active
        db.add(asset)
        db.flush()
        db.refresh(asset)
    return asset
