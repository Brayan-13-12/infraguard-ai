"""The ``Incident`` domain - InfraGuard's operational event record (v0.5).

An incident is a tracked operational event: an outage, degradation, security
event or any situation the team needs to coordinate on. It carries a lifecycle
(``status``), an urgency (``severity`` / ``priority``), an owner and a set of
**affected assets**, plus a persisted **timeline** of everything that happened.

Design notes
------------
* Catalog values (``severity``, ``status``, ``priority``, event ``type``) follow
  the same convention as :mod:`app.models.asset`: small stable ``StrEnum``
  vocabularies stored as their English string value and constrained by a database
  ``CHECK``. No native PostgreSQL ``ENUM``, no catalog tables. Display
  translation happens in the frontend.
* The Incident <-> Asset relationship is a real many-to-many via the
  ``incident_assets`` association table - never a JSON/array column.
* ``IncidentEvent`` is a first-class persisted table, not a frontend-only
  construct. Lifecycle mutations and their timeline event are written in the
  same transaction by the service layer.

Deliberately **not** modelled here (future milestones): asset dependency
topology, automated incident correlation / alert ingestion, AI-generated root
cause analysis, external ticketing sync.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IncidentSeverity(enum.StrEnum):
    """How bad the impact is. Drives the restrained semantic colour in the UI."""

    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class IncidentStatus(enum.StrEnum):
    """Where the incident is in its lifecycle.

    ``OPEN`` / ``INVESTIGATING`` / ``IDENTIFIED`` / ``MONITORING`` are *active*
    states; ``RESOLVED`` / ``CLOSED`` are *terminal* states. Moving into a
    terminal state stamps ``resolved_at``; moving back out of one clears it
    (see :data:`TERMINAL_STATUSES` and the service layer).
    """

    OPEN = "Open"
    INVESTIGATING = "Investigating"
    IDENTIFIED = "Identified"
    MONITORING = "Monitoring"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


class IncidentPriority(enum.StrEnum):
    """Scheduling urgency, orthogonal to severity. Rendered as a neutral badge
    so it never visually competes with severity."""

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class IncidentEventType(enum.StrEnum):
    """The kinds of entry that can appear on an incident's timeline."""

    CREATED = "CREATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    SEVERITY_CHANGED = "SEVERITY_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    OWNER_CHANGED = "OWNER_CHANGED"
    ASSET_ADDED = "ASSET_ADDED"
    ASSET_REMOVED = "ASSET_REMOVED"
    COMMENT = "COMMENT"
    RESOLVED = "RESOLVED"
    REOPENED = "REOPENED"


# Terminal statuses - being in one of these means the incident is "resolved" for
# the purposes of ``resolved_at`` bookkeeping and the "open incidents" metric.
TERMINAL_STATUSES: frozenset[IncidentStatus] = frozenset(
    {IncidentStatus.RESOLVED, IncidentStatus.CLOSED}
)
ACTIVE_STATUSES: tuple[IncidentStatus, ...] = tuple(
    s for s in IncidentStatus if s not in TERMINAL_STATUSES
)

# Ordinal rank for "most urgent first" sorting (lower rank sorts first).
SEVERITY_ORDER: dict[str, int] = {
    IncidentSeverity.CRITICAL: 0,
    IncidentSeverity.HIGH: 1,
    IncidentSeverity.MEDIUM: 2,
    IncidentSeverity.LOW: 3,
}

# Field length bounds - mirrored by the Pydantic schemas.
TITLE_MAX_LENGTH = 200
OWNER_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 5000
EVENT_MESSAGE_MAX_LENGTH = 2000


def _in_check(column: str, enum_cls: type[enum.StrEnum], name: str) -> CheckConstraint:
    """Build ``CHECK (<column> IN ('A', 'B', ...))`` from an enum's values."""
    values = [member.value for member in enum_cls]
    assert all("'" not in v for v in values), "catalog values must not contain quotes"
    rendered = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({rendered})", name=name)


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("char_length(title) > 0", name="title_not_empty"),
        _in_check("severity", IncidentSeverity, "severity_valid"),
        _in_check("status", IncidentStatus, "status_valid"),
        _in_check("priority", IncidentPriority, "priority_valid"),
        Index("ix_incidents_severity", "severity"),
        Index("ix_incidents_status", "status"),
        Index("ix_incidents_priority", "priority"),
        Index("ix_incidents_started_at", "started_at"),
        Index("ix_incidents_updated_at", "updated_at"),
        Index("ix_incidents_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'Open'")
    )
    priority: Mapped[str] = mapped_column(String(4), nullable=False)

    owner: Mapped[str | None] = mapped_column(String(OWNER_MAX_LENGTH), nullable=True)

    # When the incident began. Defaults to "now" at creation but the operator can
    # backdate it. ``detected_at`` / ``resolved_at`` are optional lifecycle marks.
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    detected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Incident id={self.id!s} title={self.title!r} status={self.status}>"


class IncidentAsset(Base):
    """Association row: one affected asset on one incident.

    Composite primary key ``(incident_id, asset_id)`` doubles as the uniqueness
    guarantee - an asset cannot be attached to the same incident twice. Both
    sides cascade on delete so tearing down an incident (or an asset) never
    leaves orphan rows.
    """

    __tablename__ = "incident_assets"
    __table_args__ = (
        Index("ix_incident_assets_asset_id", "asset_id"),
    )

    incident_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<IncidentAsset incident={self.incident_id!s} asset={self.asset_id!s}>"


class IncidentEvent(Base):
    """A persisted timeline entry for an incident.

    Written by the service layer in the same transaction as the mutation that
    caused it (creation, status/severity/priority/owner change, asset add/remove,
    resolve, reopen, comment). ``created_by`` is nullable to leave room for
    system-generated events in a later milestone; today it is always a user.
    """

    __tablename__ = "incident_events"
    __table_args__ = (
        CheckConstraint("char_length(message) > 0", name="message_not_empty"),
        _in_check("type", IncidentEventType, "type_valid"),
        Index("ix_incident_events_incident_id_created_at", "incident_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(String(EVENT_MESSAGE_MAX_LENGTH), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<IncidentEvent id={self.id!s} type={self.type} incident={self.incident_id!s}>"
