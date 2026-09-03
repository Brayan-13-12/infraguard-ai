"""Incident persistence, query logic and timeline bookkeeping.

Kept free of HTTP concerns. Every mutation that changes an incident also appends
the matching :class:`~app.models.incident.IncidentEvent` rows **in the same
unit of work** - the route calls ``db.commit()`` once, so the mutation and its
timeline entry are atomic.

Timeline messages are persisted in Spanish (the product's primary content
language, per the UI guidelines); ``event.type`` carries the language-neutral
classification used for icons and filtering.

``resolved_at`` / reopen rule (documented decision)
--------------------------------------------------
Moving an incident into a terminal status (``Resolved`` / ``Closed``) stamps
``resolved_at`` with the current time if it is not already set. Moving an
incident **out** of a terminal status ("reopen") **clears** ``resolved_at`` back
to ``NULL`` - the field always reflects the *current* resolution state, and the
history of a prior resolution is preserved as ``RESOLVED`` / ``REOPENED``
entries on the timeline.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.incident import (
    ACTIVE_STATUSES,
    SEVERITY_ORDER,
    TERMINAL_STATUSES,
    Incident,
    IncidentAsset,
    IncidentEvent,
    IncidentEventType,
    IncidentPriority,
    IncidentSeverity,
    IncidentStatus,
)
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentUpdate

RESOLVED_RECENTLY_DAYS = 7

# Spanish labels for timeline prose. English catalog values stay the source of
# truth everywhere else.
_ES_SEVERITY = {
    "Critical": "Crítica",
    "High": "Alta",
    "Medium": "Media",
    "Low": "Baja",
}
_ES_STATUS = {
    "Open": "Abierto",
    "Investigating": "Investigando",
    "Identified": "Identificado",
    "Monitoring": "En monitoreo",
    "Resolved": "Resuelto",
    "Closed": "Cerrado",
}

_SORTS = ("recent", "oldest", "started", "severity")


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _live_incident() -> ColumnElement[bool]:
    """Every normal incident query excludes soft-deleted (trashed) incidents."""
    return Incident.deleted_at.is_(None)


def _live_asset() -> ColumnElement[bool]:
    return Asset.deleted_at.is_(None)


def _clock() -> Iterator[datetime]:
    """Monotonic timestamp source so multiple events written in one operation
    keep a stable chronological order (UUID ids are not time-ordered)."""
    base = datetime.now(UTC)
    n = 0
    while True:
        yield base + timedelta(microseconds=n)
        n += 1


@dataclass(frozen=True, slots=True)
class IncidentQuery:
    search: str | None = None
    severity: tuple[IncidentSeverity, ...] = ()
    status: tuple[IncidentStatus, ...] = ()
    priority: tuple[IncidentPriority, ...] = ()
    asset_id: uuid.UUID | None = None
    started_from: datetime | None = None
    started_to: datetime | None = None
    sort: str = "recent"
    page: int = 1
    page_size: int = 20


@dataclass(frozen=True, slots=True)
class IncidentDetail:
    incident: Incident
    assets: list[Asset] = field(default_factory=list)
    timeline: list[tuple[IncidentEvent, str | None]] = field(default_factory=list)


# --- Queries ---------------------------------------------------------------


def _affected_count_subquery() -> ColumnElement[int]:
    return (
        select(func.count(IncidentAsset.asset_id))
        .where(IncidentAsset.incident_id == Incident.id)
        .correlate(Incident)
        .scalar_subquery()
    )


def _conditions(q: IncidentQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [_live_incident()]
    if q.severity:
        conds.append(Incident.severity.in_([s.value for s in q.severity]))
    if q.status:
        conds.append(Incident.status.in_([s.value for s in q.status]))
    if q.priority:
        conds.append(Incident.priority.in_([p.value for p in q.priority]))
    if q.asset_id is not None:
        conds.append(
            Incident.id.in_(
                select(IncidentAsset.incident_id).where(
                    IncidentAsset.asset_id == q.asset_id
                )
            )
        )
    if q.started_from is not None:
        conds.append(Incident.started_at >= q.started_from)
    if q.started_to is not None:
        conds.append(Incident.started_at <= q.started_to)

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


def _order_by(sort: str):
    if sort == "oldest":
        return (Incident.updated_at.asc(), Incident.id.asc())
    if sort == "started":
        return (Incident.started_at.desc(), Incident.id.desc())
    if sort == "severity":
        rank = case(
            {str(sev): order for sev, order in SEVERITY_ORDER.items()},
            value=Incident.severity,
            else_=99,
        )
        return (rank.asc(), Incident.updated_at.desc(), Incident.id.desc())
    return (Incident.updated_at.desc(), Incident.id.desc())  # "recent"


def list_incidents(
    db: Session, q: IncidentQuery
) -> tuple[list[tuple[Incident, int]], int]:
    """Return ``([(incident, affected_asset_count), ...], total_matching)``.

    The affected-asset count is a correlated sub-select evaluated by the
    database in the same query - no per-row round trip.
    """
    conds = _conditions(q)

    total = db.execute(
        select(func.count()).select_from(Incident).where(*conds)
    ).scalar_one()

    rows = db.execute(
        select(Incident, _affected_count_subquery().label("affected_asset_count"))
        .where(*conds)
        .order_by(*_order_by(q.sort))
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    ).all()
    return [(row[0], int(row[1])) for row in rows], int(total)


def get_incident(db: Session, incident_id: uuid.UUID) -> Incident | None:
    """Plain primary-key fetch - returns the row even if it is in Trash. The
    routes decide the policy (normal endpoints reject a trashed incident; the
    delete endpoint needs to see it to report "already in Trash")."""
    return db.get(Incident, incident_id)


def get_incident_detail(db: Session, incident_id: uuid.UUID) -> IncidentDetail | None:
    incident = db.get(Incident, incident_id)
    if incident is None:
        return None

    assets = list(
        db.execute(
            select(Asset)
            .join(IncidentAsset, IncidentAsset.asset_id == Asset.id)
            .where(IncidentAsset.incident_id == incident_id)
            .order_by(Asset.name.asc(), Asset.id.asc())
        )
        .scalars()
        .all()
    )

    timeline = [
        (event, actor_email)
        for event, actor_email in db.execute(
            select(IncidentEvent, User.email)
            .outerjoin(User, User.id == IncidentEvent.created_by)
            .where(IncidentEvent.incident_id == incident_id)
            .order_by(IncidentEvent.created_at.asc(), IncidentEvent.id.asc())
        ).all()
    ]

    return IncidentDetail(incident=incident, assets=assets, timeline=timeline)


def existing_asset_ids(
    db: Session, asset_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    """The subset of ``asset_ids`` that actually exist - the route diffs this to
    reject unknown asset relationships with a 422."""
    if not asset_ids:
        return set()
    # Trashed assets are not linkable to incidents (a new / edited relationship
    # must point at a live asset). Existing persisted links are untouched.
    return set(
        db.execute(
            select(Asset.id).where(Asset.id.in_(asset_ids), _live_asset())
        ).scalars()
    )


def _asset_names(db: Session, asset_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not asset_ids:
        return {}
    return {
        aid: name
        for aid, name in db.execute(
            select(Asset.id, Asset.name).where(Asset.id.in_(asset_ids))
        ).all()
    }


# --- Mutations -----------------------------------------------------------


def _event(
    incident_id: uuid.UUID,
    event_type: IncidentEventType,
    message: str,
    actor_id: uuid.UUID | None,
    when: datetime,
) -> IncidentEvent:
    return IncidentEvent(
        incident_id=incident_id,
        type=event_type.value,
        message=message,
        created_by=actor_id,
        created_at=when,
    )


def _current_asset_ids(db: Session, incident_id: uuid.UUID) -> set[uuid.UUID]:
    return set(
        db.execute(
            select(IncidentAsset.asset_id).where(
                IncidentAsset.incident_id == incident_id
            )
        ).scalars()
    )


def _apply_asset_set(
    db: Session,
    incident: Incident,
    target_ids: list[uuid.UUID],
    actor_id: uuid.UUID,
    clock: Iterator[datetime],
) -> None:
    """Reconcile the affected-asset set to exactly ``target_ids`` and emit
    ASSET_ADDED / ASSET_REMOVED events for the difference."""
    current = _current_asset_ids(db, incident.id)
    target = set(target_ids)
    to_add = target - current
    to_remove = current - target
    if not to_add and not to_remove:
        return

    names = _asset_names(db, to_add | to_remove)
    for asset_id in target_ids:  # preserve caller order for deterministic events
        if asset_id in to_add:
            db.add(IncidentAsset(incident_id=incident.id, asset_id=asset_id))
            db.add(
                _event(
                    incident.id,
                    IncidentEventType.ASSET_ADDED,
                    f'Activo "{names.get(asset_id, asset_id)}" añadido',
                    actor_id,
                    next(clock),
                )
            )
    for asset_id in sorted(to_remove, key=lambda a: names.get(a, "")):
        db.execute(
            IncidentAsset.__table__.delete().where(
                and_(
                    IncidentAsset.incident_id == incident.id,
                    IncidentAsset.asset_id == asset_id,
                )
            )
        )
        db.add(
            _event(
                incident.id,
                IncidentEventType.ASSET_REMOVED,
                f'Activo "{names.get(asset_id, asset_id)}" eliminado',
                actor_id,
                next(clock),
            )
        )


def create_incident(
    db: Session, data: IncidentCreate, *, actor: User
) -> Incident:
    """Insert the incident, its ``CREATED`` event and any affected-asset links
    (each with an ``ASSET_ADDED`` event). Caller ``asset_ids`` are assumed to
    have been validated by the route."""
    clock = _clock()
    starts_terminal = data.status in TERMINAL_STATUSES

    incident = Incident(
        title=data.title,
        description=data.description,
        severity=data.severity.value,
        priority=data.priority.value,
        status=data.status.value,
        owner=data.owner,
        created_by=actor.id,
    )
    if data.started_at is not None:
        incident.started_at = data.started_at
    if data.detected_at is not None:
        incident.detected_at = data.detected_at
    if starts_terminal:
        incident.resolved_at = data.started_at or datetime.now(UTC)

    db.add(incident)
    db.flush()  # assign incident.id

    db.add(
        _event(
            incident.id,
            IncidentEventType.CREATED,
            "Incidente creado",
            actor.id,
            next(clock),
        )
    )
    if data.asset_ids:
        _apply_asset_set(db, incident, data.asset_ids, actor.id, clock)

    db.flush()
    db.refresh(incident)
    return incident


def _status_change_events(
    incident_id: uuid.UUID,
    old: str,
    new: str,
    actor_id: uuid.UUID,
    clock: Iterator[datetime],
) -> list[IncidentEvent]:
    old_terminal = old in {s.value for s in TERMINAL_STATUSES}
    new_terminal = new in {s.value for s in TERMINAL_STATUSES}

    if new_terminal and not old_terminal:
        verb = "cerrado" if new == IncidentStatus.CLOSED.value else "resuelto"
        return [
            _event(
                incident_id,
                IncidentEventType.RESOLVED,
                f"Incidente marcado como {verb}",
                actor_id,
                next(clock),
            )
        ]
    if old_terminal and not new_terminal:
        return [
            _event(
                incident_id,
                IncidentEventType.REOPENED,
                f"Incidente reabierto ({_ES_STATUS.get(new, new)})",
                actor_id,
                next(clock),
            )
        ]
    return [
        _event(
            incident_id,
            IncidentEventType.STATUS_CHANGED,
            f"Estado cambió de {_ES_STATUS.get(old, old)} a {_ES_STATUS.get(new, new)}",
            actor_id,
            next(clock),
        )
    ]


def update_incident(
    db: Session, incident: Incident, data: IncidentUpdate, *, actor: User
) -> Incident:
    """Apply the sent fields, emitting a timeline event for every meaningful
    change. ``asset_ids`` (when provided) replaces the affected-asset set."""
    sent = data.model_dump(exclude_unset=True)
    clock = _clock()
    now = datetime.now(UTC)

    if "title" in sent and data.title is not None and data.title != incident.title:
        incident.title = data.title
    if "description" in sent:
        incident.description = data.description
    if "started_at" in sent and data.started_at is not None:
        incident.started_at = data.started_at
    if "detected_at" in sent:
        incident.detected_at = data.detected_at

    if "severity" in sent and data.severity is not None:
        new = data.severity.value
        if new != incident.severity:
            db.add(
                _event(
                    incident.id,
                    IncidentEventType.SEVERITY_CHANGED,
                    "Severidad cambió de "
                    f"{_ES_SEVERITY.get(incident.severity, incident.severity)} a "
                    f"{_ES_SEVERITY.get(new, new)}",
                    actor.id,
                    next(clock),
                )
            )
            incident.severity = new

    if "priority" in sent and data.priority is not None:
        new = data.priority.value
        if new != incident.priority:
            db.add(
                _event(
                    incident.id,
                    IncidentEventType.PRIORITY_CHANGED,
                    f"Prioridad cambió de {incident.priority} a {new}",
                    actor.id,
                    next(clock),
                )
            )
            incident.priority = new

    if "owner" in sent and data.owner != incident.owner:
        if not data.owner:
            msg = "Responsable eliminado"
        elif not incident.owner:
            msg = f"Responsable asignado a {data.owner}"
        else:
            msg = f"Responsable cambió de {incident.owner} a {data.owner}"
        db.add(
            _event(
                incident.id,
                IncidentEventType.OWNER_CHANGED,
                msg,
                actor.id,
                next(clock),
            )
        )
        incident.owner = data.owner

    if "status" in sent and data.status is not None:
        new = data.status.value
        if new != incident.status:
            for evt in _status_change_events(
                incident.id, incident.status, new, actor.id, clock
            ):
                db.add(evt)
            _reconcile_resolved_at(incident, new, now)
            incident.status = new

    if data.asset_ids is not None:
        _apply_asset_set(db, incident, data.asset_ids, actor.id, clock)

    db.add(incident)
    db.flush()
    db.refresh(incident)
    return incident


def _reconcile_resolved_at(incident: Incident, new_status: str, now: datetime) -> None:
    terminal = {s.value for s in TERMINAL_STATUSES}
    if new_status in terminal:
        if incident.resolved_at is None:
            incident.resolved_at = now
    else:
        incident.resolved_at = None


def resolve_incident(db: Session, incident: Incident, *, actor: User) -> Incident:
    """Force the incident to ``Resolved`` (idempotent)."""
    if incident.status == IncidentStatus.RESOLVED.value:
        return incident
    clock = _clock()
    for evt in _status_change_events(
        incident.id, incident.status, IncidentStatus.RESOLVED.value, actor.id, clock
    ):
        db.add(evt)
    _reconcile_resolved_at(incident, IncidentStatus.RESOLVED.value, datetime.now(UTC))
    incident.status = IncidentStatus.RESOLVED.value
    db.add(incident)
    db.flush()
    db.refresh(incident)
    return incident


def reopen_incident(db: Session, incident: Incident, *, actor: User) -> Incident:
    """Move a terminal incident back to ``Open`` (idempotent for active ones)."""
    if incident.status not in {s.value for s in TERMINAL_STATUSES}:
        return incident
    clock = _clock()
    for evt in _status_change_events(
        incident.id, incident.status, IncidentStatus.OPEN.value, actor.id, clock
    ):
        db.add(evt)
    _reconcile_resolved_at(incident, IncidentStatus.OPEN.value, datetime.now(UTC))
    incident.status = IncidentStatus.OPEN.value
    db.add(incident)
    db.flush()
    db.refresh(incident)
    return incident


def add_comment(
    db: Session, incident: Incident, message: str, *, actor: User
) -> IncidentEvent:
    event = _event(
        incident.id,
        IncidentEventType.COMMENT,
        message,
        actor.id,
        datetime.now(UTC),
    )
    db.add(event)
    # touch updated_at so the list reflects recent activity
    db.add(incident)
    incident.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(event)
    return event


# --- Dashboard aggregation ---------------------------------------------


def _grouped_counts(db: Session, column, enum_cls: type) -> dict[str, int]:
    counts = {member.value: 0 for member in enum_cls}
    for value, count in db.execute(
        select(column, func.count())
        .select_from(Incident)
        .where(_live_incident())
        .group_by(column)
    ).all():
        if value in counts:
            counts[value] = int(count)
    return counts


def get_incident_summary(db: Session) -> dict[str, object]:
    active = [s.value for s in ACTIVE_STATUSES]
    terminal = [s.value for s in TERMINAL_STATUSES]
    cutoff = datetime.now(UTC) - timedelta(days=RESOLVED_RECENTLY_DAYS)

    total, open_, critical_open, investigating, monitoring, resolved_recently = (
        db.execute(
            select(
                func.count(),
                func.count().filter(Incident.status.in_(active)),
                func.count().filter(
                    and_(
                        Incident.status.in_(active),
                        Incident.severity == IncidentSeverity.CRITICAL.value,
                    )
                ),
                func.count().filter(
                    Incident.status == IncidentStatus.INVESTIGATING.value
                ),
                func.count().filter(
                    Incident.status == IncidentStatus.MONITORING.value
                ),
                func.count().filter(
                    and_(
                        Incident.status.in_(terminal),
                        Incident.resolved_at.is_not(None),
                        Incident.resolved_at >= cutoff,
                    )
                ),
            )
            .select_from(Incident)
            .where(_live_incident())
        ).one()
    )

    return {
        "total": int(total),
        "open": int(open_),
        "critical_open": int(critical_open),
        "investigating": int(investigating),
        "monitoring": int(monitoring),
        "resolved_recently": int(resolved_recently),
        "by_severity": _grouped_counts(db, Incident.severity, IncidentSeverity),
        "by_status": _grouped_counts(db, Incident.status, IncidentStatus),
    }
