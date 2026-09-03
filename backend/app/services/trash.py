"""Trash / Restore persistence (Governance & Administration - Phase 2).

Soft delete is the *only* delete: a record's ``deleted_at`` / ``deleted_by`` are
stamped, nothing is physically removed, and the timeline / relationships of a
trashed incident are left byte-for-byte intact so a restore is lossless.

This module is the **dedicated Trash query path**: it is the only place that
selects ``deleted_at IS NOT NULL`` rows. Every other service filters them out.
Actor identity always comes from the caller (the authenticated session) - never
from a request body.

List queries join ``users`` once for the deleter's email (no per-row lookup).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetType, Criticality
from app.models.incident import (
    Incident,
    IncidentAsset,
    IncidentSeverity,
    IncidentStatus,
)
from app.models.user import User
from app.services.incidents import IncidentDetail, get_incident_detail

ASSETS_DEFAULT_PAGE_SIZE = 20
INCIDENTS_DEFAULT_PAGE_SIZE = 15
MAX_PAGE_SIZE = 100


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# --------------------------------------------------------------------------
# Queries
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TrashAssetQuery:
    search: str | None = None
    asset_type: AssetType | None = None
    criticality: tuple[Criticality, ...] = ()
    deleted_by: str | None = None
    deleted_from: datetime | None = None
    deleted_to: datetime | None = None
    page: int = 1
    page_size: int = ASSETS_DEFAULT_PAGE_SIZE


@dataclass(frozen=True, slots=True)
class TrashIncidentQuery:
    search: str | None = None
    severity: tuple[IncidentSeverity, ...] = ()
    status: tuple[IncidentStatus, ...] = ()
    deleted_by: str | None = None
    deleted_from: datetime | None = None
    deleted_to: datetime | None = None
    page: int = 1
    page_size: int = INCIDENTS_DEFAULT_PAGE_SIZE


def _asset_conditions(q: TrashAssetQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [Asset.deleted_at.is_not(None)]
    if q.asset_type is not None:
        conds.append(Asset.asset_type == q.asset_type.value)
    if q.criticality:
        conds.append(Asset.criticality.in_([c.value for c in q.criticality]))
    if q.deleted_from is not None:
        conds.append(Asset.deleted_at >= q.deleted_from)
    if q.deleted_to is not None:
        conds.append(Asset.deleted_at <= q.deleted_to)
    if q.deleted_by and q.deleted_by.strip():
        pattern = f"%{_escape_like(q.deleted_by.strip())}%"
        conds.append(User.email.ilike(pattern, escape="\\"))
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


def list_trashed_assets(
    db: Session, q: TrashAssetQuery
) -> tuple[list[tuple[Asset, str | None]], int]:
    """``([(asset, deleted_by_email), ...], total)`` - most recently deleted first.

    One ``LEFT JOIN users`` for the deleter's email; no per-row lookup.
    """
    conds = _asset_conditions(q)
    base = select(Asset).outerjoin(User, User.id == Asset.deleted_by).where(*conds)

    total = db.execute(
        select(func.count()).select_from(base.order_by(None).subquery())
    ).scalar_one()

    rows = db.execute(
        select(Asset, User.email)
        .outerjoin(User, User.id == Asset.deleted_by)
        .where(*conds)
        .order_by(Asset.deleted_at.desc(), Asset.id.desc())
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    ).all()
    return [(row[0], row[1]) for row in rows], int(total)


def get_trashed_asset(
    db: Session, asset_id: uuid.UUID
) -> tuple[Asset, str | None] | None:
    row = db.execute(
        select(Asset, User.email)
        .outerjoin(User, User.id == Asset.deleted_by)
        .where(Asset.id == asset_id, Asset.deleted_at.is_not(None))
    ).first()
    return (row[0], row[1]) if row else None


def _incident_conditions(q: TrashIncidentQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [Incident.deleted_at.is_not(None)]
    if q.severity:
        conds.append(Incident.severity.in_([s.value for s in q.severity]))
    if q.status:
        conds.append(Incident.status.in_([s.value for s in q.status]))
    if q.deleted_from is not None:
        conds.append(Incident.deleted_at >= q.deleted_from)
    if q.deleted_to is not None:
        conds.append(Incident.deleted_at <= q.deleted_to)
    if q.deleted_by and q.deleted_by.strip():
        pattern = f"%{_escape_like(q.deleted_by.strip())}%"
        conds.append(User.email.ilike(pattern, escape="\\"))
    term = (q.search or "").strip()
    if term:
        pattern = f"%{_escape_like(term)}%"
        conds.append(
            or_(
                Incident.title.ilike(pattern, escape="\\"),
                Incident.description.ilike(pattern, escape="\\"),
                Incident.owner.ilike(pattern, escape="\\"),
            )
        )
    return conds


def _affected_count_subquery() -> ColumnElement[int]:
    return (
        select(func.count(IncidentAsset.asset_id))
        .where(IncidentAsset.incident_id == Incident.id)
        .correlate(Incident)
        .scalar_subquery()
    )


def list_trashed_incidents(
    db: Session, q: TrashIncidentQuery
) -> tuple[list[tuple[Incident, str | None, int]], int]:
    """``([(incident, deleted_by_email, affected_asset_count), ...], total)``.

    The affected-asset count is a correlated sub-select (preserved relationships,
    no N+1); one ``LEFT JOIN users`` for the deleter's email.
    """
    conds = _incident_conditions(q)

    total = db.execute(
        select(func.count())
        .select_from(Incident)
        .outerjoin(User, User.id == Incident.deleted_by)
        .where(*conds)
    ).scalar_one()

    rows = db.execute(
        select(
            Incident,
            User.email,
            _affected_count_subquery().label("affected_asset_count"),
        )
        .outerjoin(User, User.id == Incident.deleted_by)
        .where(*conds)
        .order_by(Incident.deleted_at.desc(), Incident.id.desc())
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    ).all()
    return [(row[0], row[1], int(row[2])) for row in rows], int(total)


def get_trashed_incident_detail(
    db: Session, incident_id: uuid.UUID
) -> tuple[IncidentDetail, str | None] | None:
    """Full detail (metadata + preserved timeline + affected assets) of a
    trashed incident, plus the deleter's email."""
    detail = get_incident_detail(db, incident_id)
    if detail is None or detail.incident.deleted_at is None:
        return None
    email = db.execute(
        select(User.email).where(User.id == detail.incident.deleted_by)
    ).scalar_one_or_none()
    return detail, email


def trash_summary(db: Session) -> dict[str, int]:
    assets = db.execute(
        select(func.count()).select_from(Asset).where(Asset.deleted_at.is_not(None))
    ).scalar_one()
    incidents = db.execute(
        select(func.count())
        .select_from(Incident)
        .where(Incident.deleted_at.is_not(None))
    ).scalar_one()
    return {"assets": int(assets), "incidents": int(incidents)}


# --------------------------------------------------------------------------
# Mutations - never commit (the route owns the transaction, so the mutation and
# its audit event are atomic).
# --------------------------------------------------------------------------


def soft_delete_asset(db: Session, asset: Asset, *, actor: User) -> Asset:
    asset.deleted_at = datetime.now(UTC)
    asset.deleted_by = actor.id
    db.add(asset)
    db.flush()
    db.refresh(asset)
    return asset


def restore_asset(db: Session, asset: Asset) -> Asset:
    """Clear the Trash marks. The restore actor is recorded on the audit
    ``RESTORE`` event, not on the asset row."""
    asset.deleted_at = None
    asset.deleted_by = None
    db.add(asset)
    db.flush()
    db.refresh(asset)
    return asset


def soft_delete_incident(db: Session, incident: Incident, *, actor: User) -> Incident:
    incident.deleted_at = datetime.now(UTC)
    incident.deleted_by = actor.id
    db.add(incident)
    db.flush()
    db.refresh(incident)
    return incident


def restore_incident(db: Session, incident: Incident) -> Incident:
    incident.deleted_at = None
    incident.deleted_by = None
    db.add(incident)
    db.flush()
    db.refresh(incident)
    return incident
