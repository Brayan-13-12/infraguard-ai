"""The central audit service.

One place that writes :class:`~app.models.audit.AuditEvent` /
:class:`~app.models.audit.AuditChange` rows and one place that reads them back.
Entity-agnostic: routes pass an :class:`AuditContext`, an action, an
``(entity_type, entity_id, entity_label)`` triple and an optional list of
:class:`FieldChange`. It **never commits** - the calling route owns the
transaction, so the audit event is atomic with the mutation it describes.
"""

from __future__ import annotations

import enum
import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, NamedTuple

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.audit import (
    REDACTED,
    SENSITIVE_FIELD_TOKENS,
    VALUE_MAX_LENGTH,
    AuditChange,
    AuditEvent,
)

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25
_SUMMARY_METADATA_MAX_CHARS = 4000

#: How many change rows the lightweight list projection previews per event. The
#: full set stays exclusive to the detail endpoint.
CHANGE_PREVIEW_LIMIT = 3


# --------------------------------------------------------------------------
# Context + change primitives
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AuditContext:
    """Everything the audit writer needs about *who* and *from where*.

    Built by ``app.api.request_context.get_audit_context``. ``actor_*`` is a
    **snapshot** - kept even if the user is later disabled/deleted.
    """

    actor_user_id: uuid.UUID | None
    actor_email: str | None
    request_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class FieldChange(NamedTuple):
    field: str
    old: Any
    new: Any


def is_sensitive_field(name: str) -> bool:
    lowered = name.lower()
    return any(token in lowered for token in SENSITIVE_FIELD_TOKENS)


def serialize_audit_value(value: Any) -> str | None:
    """Safe scalar representation for an audit ``old_value`` / ``new_value``.

    ``None`` stays ``None`` (a real SQL NULL, distinct from the string
    ``"null"``). Everything else becomes a bounded string. Arbitrary ORM objects
    are **not** serialised - callers pass already-simple values / labels.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, int | float):
        return str(value)
    if isinstance(value, str):
        text = value
    elif isinstance(value, list | tuple):
        # small arrays of identifiers / labels only
        parts = [serialize_audit_value(v) or "null" for v in value]
        text = ", ".join(parts)
    else:  # pragma: no cover - defensive; callers should not reach here
        text = repr(value)
    if len(text) > VALUE_MAX_LENGTH:
        text = text[: VALUE_MAX_LENGTH - 1] + "…"
    return text


def _serialize_change(change: FieldChange) -> AuditChange:
    if is_sensitive_field(change.field):
        return AuditChange(field_name=change.field, old_value=REDACTED, new_value=REDACTED)
    return AuditChange(
        field_name=change.field,
        old_value=serialize_audit_value(change.old),
        new_value=serialize_audit_value(change.new),
    )


def _scrub_metadata(value: Any, _depth: int = 0) -> Any:
    """Recursively redact sensitive keys and drop anything non-JSON-safe.

    Guards against a caller accidentally handing the audit log a request body or
    a credential. Bounded depth + the JSONB column size are the real backstops.
    """
    if _depth > 6:
        return None
    if isinstance(value, Mapping):
        out: dict[str, Any] = {}
        for k, v in value.items():
            key = str(k)
            out[key] = REDACTED if is_sensitive_field(key) else _scrub_metadata(v, _depth + 1)
        return out
    if isinstance(value, list | tuple):
        return [_scrub_metadata(v, _depth + 1) for v in value]
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, uuid.UUID | datetime):
        return str(value)
    return str(value)


def diff_fields(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
    fields: Iterable[str],
) -> list[FieldChange]:
    """Only the fields in ``fields`` whose value actually changed.

    Handles ``null -> value`` and ``value -> null`` correctly. Sensitive field
    names still produce a change row (redacted) so "it changed" is recorded.
    """
    changes: list[FieldChange] = []
    for field in fields:
        old = before.get(field)
        new = after.get(field)
        if old != new:
            changes.append(FieldChange(field, old, new))
    return changes


# --------------------------------------------------------------------------
# Write
# --------------------------------------------------------------------------


def record_event(
    db: Session,
    *,
    ctx: AuditContext,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID | None = None,
    entity_label: str | None = None,
    changes: Sequence[FieldChange] | None = None,
    metadata: Mapping[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> AuditEvent:
    """Append one audit event (+ its change rows) to the **current** session.

    Does **not** commit or flush the outer transaction is committed by the route.
    If that commit never happens (request error, explicit rollback) the audit
    event is discarded along with the mutation it described.
    """
    scrubbed_meta = _scrub_metadata(dict(metadata)) if metadata else None
    if isinstance(scrubbed_meta, dict) and len(str(scrubbed_meta)) > _SUMMARY_METADATA_MAX_CHARS:
        scrubbed_meta = {"truncated": True}

    event = AuditEvent(
        occurred_at=occurred_at or datetime.now(UTC),
        action=str(action),
        entity_type=str(entity_type),
        entity_id=str(entity_id) if entity_id is not None else None,
        entity_label=(entity_label[:300] if entity_label else None),
        actor_user_id=ctx.actor_user_id,
        actor_email=ctx.actor_email,
        request_id=ctx.request_id,
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent,
        event_metadata=scrubbed_meta,
    )
    db.add(event)
    db.flush()  # assign event.id

    for change in changes or ():
        row = _serialize_change(change)
        row.audit_event_id = event.id
        db.add(row)
    db.flush()
    return event


# --------------------------------------------------------------------------
# Read
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AuditQuery:
    search: str | None = None
    action: tuple[str, ...] = ()
    entity_type: tuple[str, ...] = ()
    actor: str | None = None
    entity_id: str | None = None
    occurred_from: datetime | None = None
    occurred_to: datetime | None = None
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _conditions(q: AuditQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    if q.action:
        conds.append(AuditEvent.action.in_(list(q.action)))
    if q.entity_type:
        conds.append(AuditEvent.entity_type.in_(list(q.entity_type)))
    if q.entity_id:
        conds.append(AuditEvent.entity_id == q.entity_id)
    if q.actor:
        pattern = f"%{_escape_like(q.actor.strip())}%"
        conds.append(AuditEvent.actor_email.ilike(pattern, escape="\\"))
    if q.occurred_from is not None:
        conds.append(AuditEvent.occurred_at >= q.occurred_from)
    if q.occurred_to is not None:
        conds.append(AuditEvent.occurred_at <= q.occurred_to)

    term = (q.search or "").strip()
    if term:
        pattern = f"%{_escape_like(term)}%"
        conds.append(
            or_(
                AuditEvent.actor_email.ilike(pattern, escape="\\"),
                AuditEvent.entity_label.ilike(pattern, escape="\\"),
                AuditEvent.entity_id.ilike(pattern, escape="\\"),
                AuditEvent.action.ilike(pattern, escape="\\"),
            )
        )
    return conds


def _change_count_subquery() -> ColumnElement[int]:
    return (
        select(func.count(AuditChange.id))
        .where(AuditChange.audit_event_id == AuditEvent.id)
        .correlate(AuditEvent)
        .scalar_subquery()
    )


class AuditListRow(NamedTuple):
    """One row of the audit list: the event, its total change count, and a
    bounded preview of the first :data:`CHANGE_PREVIEW_LIMIT` change rows."""

    event: AuditEvent
    change_count: int
    change_preview: list[AuditChange]


def _change_previews(
    db: Session, event_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[AuditChange]]:
    """First :data:`CHANGE_PREVIEW_LIMIT` change rows per event, in **one** query.

    This is what keeps the timeline's inline change preview from turning into an
    N+1 (one ``GET /audit/{id}`` per row). Stored ``old_value`` / ``new_value``
    are already redaction-safe - :func:`_serialize_change` applied the
    sensitive-field denylist at write time - so nothing is re-serialised here.
    """
    if not event_ids:
        return {}
    ordered = (
        db.execute(
            select(AuditChange)
            .where(AuditChange.audit_event_id.in_(list(event_ids)))
            .order_by(AuditChange.audit_event_id.asc(), AuditChange.field_name.asc())
        )
        .scalars()
        .all()
    )
    out: dict[uuid.UUID, list[AuditChange]] = {}
    for change in ordered:
        bucket = out.setdefault(change.audit_event_id, [])
        if len(bucket) < CHANGE_PREVIEW_LIMIT:
            bucket.append(change)
    return out


def list_audit_events(db: Session, q: AuditQuery) -> tuple[list[AuditListRow], int]:
    """``([AuditListRow, ...], total)`` - newest first.

    The list stays lightweight: per event it returns the **count** of field
    changes plus a **bounded preview** (first ``CHANGE_PREVIEW_LIMIT``), never
    the full set - that stays exclusive to the detail endpoint. Exactly **two**
    queries regardless of page size (the page + one batched preview fetch).
    """
    conds = _conditions(q)
    total = db.execute(
        select(func.count()).select_from(AuditEvent).where(*conds)
    ).scalar_one()

    stmt: Select[Any] = (
        select(AuditEvent, _change_count_subquery().label("change_count"))
        .where(*conds)
        .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    )
    rows = db.execute(stmt).all()
    previews = _change_previews(db, [row[0].id for row in rows])
    return (
        [
            AuditListRow(row[0], int(row[1]), previews.get(row[0].id, []))
            for row in rows
        ],
        int(total),
    )


def get_audit_event(
    db: Session, event_id: uuid.UUID
) -> tuple[AuditEvent, list[AuditChange]] | None:
    event = db.get(AuditEvent, event_id)
    if event is None:
        return None
    changes = list(
        db.execute(
            select(AuditChange)
            .where(AuditChange.audit_event_id == event_id)
            .order_by(AuditChange.field_name.asc())
        )
        .scalars()
        .all()
    )
    return event, changes


def audit_summary(db: Session) -> dict[str, int]:
    """Compact, honestly-derivable counters for *today* (UTC)."""
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    events_today, logins_today, active_actors = db.execute(
        select(
            func.count(),
            func.count().filter(AuditEvent.action == "LOGIN"),
            func.count(func.distinct(AuditEvent.actor_user_id)),
        )
        .select_from(AuditEvent)
        .where(AuditEvent.occurred_at >= today)
    ).one()

    changes_today = db.execute(
        select(func.count(AuditChange.id))
        .select_from(AuditChange)
        .join(AuditEvent, AuditEvent.id == AuditChange.audit_event_id)
        .where(AuditEvent.occurred_at >= today)
    ).scalar_one()

    return {
        "events_today": int(events_today),
        "changes_today": int(changes_today),
        "logins_today": int(logins_today),
        "active_actors_today": int(active_actors),
    }
