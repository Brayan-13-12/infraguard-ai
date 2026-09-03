"""Build a well-formed, backdated incident timeline for a demo incident.

Mirrors the vocabulary, ordering and Spanish prose of
:mod:`app.services.incidents` (``CREATED`` first, ``ASSET_ADDED`` per asset,
``STATUS_CHANGED`` / ``RESOLVED`` transitions, ``resolved_at`` set iff the final
status is terminal), just with historical timestamps the request-path service
cannot produce.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models.incident import (
    TERMINAL_STATUSES,
    IncidentEvent,
    IncidentEventType,
)
from app.seeds.incidents import IncidentSpec

_ES_STATUS = {
    "Open": "Abierto",
    "Investigating": "Investigando",
    "Identified": "Identificado",
    "Monitoring": "En monitoreo",
    "Resolved": "Resuelto",
    "Closed": "Cerrado",
}
_ES_SEVERITY = {
    "Critical": "Crítica",
    "High": "Alta",
    "Medium": "Media",
    "Low": "Baja",
}
_TERMINAL = {s.value for s in TERMINAL_STATUSES}


@dataclass(slots=True)
class BuiltTimeline:
    events: list[IncidentEvent]
    resolved_at: datetime | None
    last_event_at: datetime


def _event(
    incident_id: uuid.UUID,
    type_: IncidentEventType,
    message: str,
    actor_id: uuid.UUID,
    when: datetime,
) -> IncidentEvent:
    return IncidentEvent(
        id=uuid.uuid4(),
        incident_id=incident_id,
        type=type_.value,
        message=message,
        created_by=actor_id,
        created_at=when,
    )


def build_timeline(
    *,
    incident_id: uuid.UUID,
    spec: IncidentSpec,
    started_at: datetime,
    asset_names: list[str],
    actor_id: uuid.UUID,
) -> BuiltTimeline:
    # Number of timeline entries: CREATED + one per asset + severity/priority
    # changes + one per status transition + comments.
    steps = (
        1
        + len(asset_names)
        + (1 if spec.severity_changed_from else 0)
        + (1 if spec.priority_changed_from else 0)
        + len(spec.path)
        + len(spec.comments)
    )
    span = timedelta(hours=max(spec.span_hours, 0.5))
    gap = span / max(steps, 1)
    clock = (started_at + gap * i for i in range(steps + 4))

    events: list[IncidentEvent] = []
    events.append(
        _event(incident_id, IncidentEventType.CREATED, "Incidente creado", actor_id, next(clock))
    )

    for name in asset_names:
        events.append(
            _event(
                incident_id,
                IncidentEventType.ASSET_ADDED,
                f'Activo "{name}" añadido',
                actor_id,
                next(clock),
            )
        )

    if spec.severity_changed_from:
        old = _ES_SEVERITY.get(spec.severity_changed_from, spec.severity_changed_from)
        new = _ES_SEVERITY.get(spec.severity, spec.severity)
        events.append(
            _event(
                incident_id,
                IncidentEventType.SEVERITY_CHANGED,
                f"Severidad cambió de {old} a {new}",
                actor_id,
                next(clock),
            )
        )
    if spec.priority_changed_from:
        events.append(
            _event(
                incident_id,
                IncidentEventType.PRIORITY_CHANGED,
                f"Prioridad cambió de {spec.priority_changed_from} a {spec.priority}",
                actor_id,
                next(clock),
            )
        )

    comments = list(spec.comments)
    resolved_at: datetime | None = None
    prev = "Open"
    for new in spec.path:
        when = next(clock)
        new_terminal = new in _TERMINAL
        prev_terminal = prev in _TERMINAL
        if new_terminal and not prev_terminal:
            verb = "cerrado" if new == "Closed" else "resuelto"
            events.append(
                _event(
                    incident_id,
                    IncidentEventType.RESOLVED,
                    f"Incidente marcado como {verb}",
                    actor_id,
                    when,
                )
            )
            resolved_at = when
        elif prev_terminal and not new_terminal:
            events.append(
                _event(
                    incident_id,
                    IncidentEventType.REOPENED,
                    f"Incidente reabierto ({_ES_STATUS.get(new, new)})",
                    actor_id,
                    when,
                )
            )
            resolved_at = None
        else:
            events.append(
                _event(
                    incident_id,
                    IncidentEventType.STATUS_CHANGED,
                    f"Estado cambió de {_ES_STATUS.get(prev, prev)} a {_ES_STATUS.get(new, new)}",
                    actor_id,
                    when,
                )
            )
        prev = new
        # Drop a comment right after a transition if any are left.
        if comments:
            events.append(
                _event(
                    incident_id,
                    IncidentEventType.COMMENT,
                    comments.pop(0),
                    actor_id,
                    next(clock),
                )
            )

    for text in comments:  # any leftover comments (e.g. Open incidents)
        events.append(
            _event(incident_id, IncidentEventType.COMMENT, text, actor_id, next(clock))
        )

    events.sort(key=lambda e: e.created_at)
    # Guarantee strictly increasing timestamps after the sort.
    for i in range(1, len(events)):
        if events[i].created_at <= events[i - 1].created_at:
            events[i].created_at = events[i - 1].created_at + timedelta(seconds=1)
    if resolved_at is not None:
        # Keep resolved_at aligned with the (possibly nudged) RESOLVED event.
        for e in events:
            if e.type in (IncidentEventType.RESOLVED.value,):
                resolved_at = e.created_at
    return BuiltTimeline(
        events=events,
        resolved_at=resolved_at,
        last_event_at=events[-1].created_at,
    )
