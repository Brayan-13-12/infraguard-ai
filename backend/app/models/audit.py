"""Application audit log (Governance & Administration - Phase 1).

A **centralized, append-only** record of governance-relevant actions: who did
what, when, to which record, and - for updates - what changed from what value to
what value. It is written **in the same transaction** as the mutation it
describes (see :func:`app.services.audit.record_event`), so a rolled-back
mutation never leaves a "successful" audit event behind.

Two tables:

``audit_events``
  one row per logical action (``CREATE`` / ``UPDATE`` / ``STATUS_CHANGED`` /
  ``RELATION_CHANGED`` / ``RESOLVED`` / ``REOPENED`` / ``LOGIN`` / ``LOGOUT`` …).
  Carries an **actor snapshot** (``actor_user_id`` *and* ``actor_email``) so the
  record still explains "who" after a user is disabled or deleted, an
  **entity snapshot** (``entity_type`` / ``entity_id`` / ``entity_label``) so the
  UI never has to load a record that may later disappear, and request context
  (``request_id`` / ``ip_address`` / ``user_agent``).

``audit_changes``
  child rows, one per changed field, with a **safe serialized** ``old_value`` /
  ``new_value`` (strings / numbers / booleans / enums / dates / UUIDs / null).
  Values for sensitive field names (password, token, secret, …) are **never**
  persisted - see :data:`SENSITIVE_FIELD_TOKENS`.

**Not** cryptographic tamper-proofing: a database administrator can technically
mutate rows directly. Append-only is enforced at the application layer (there is
no update/delete Audit API). Retention is indefinite for now; a future policy
(90 / 180 / 365 days) is documented in ``docs/architecture.md``.

``IncidentEvent`` (the per-incident business timeline) is deliberately kept
**separate** - it answers "what happened to this one incident" for operators,
while the audit log answers "what happened across the system" for governance.
They may be written from the same transaction but are distinct models.
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditAction(enum.StrEnum):
    """Centralised action vocabulary.

    The architecture supports the full set below; **only** actions for
    functionality that exists today are ever emitted. ``DELETE`` / ``RESTORE``
    (Trash) and ``ROLE_*`` / ``PERMISSION_CHANGED`` (RBAC) are reserved for
    upcoming Governance phases and are never written in Phase 1.
    """

    CREATE = "CREATE"
    UPDATE = "UPDATE"
    STATUS_CHANGED = "STATUS_CHANGED"
    RELATION_CHANGED = "RELATION_CHANGED"
    RESOLVED = "RESOLVED"
    REOPENED = "REOPENED"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    # --- reserved for later Governance phases (never emitted in Phase 1) ---
    DELETE = "DELETE"
    RESTORE = "RESTORE"
    ROLE_ASSIGNED = "ROLE_ASSIGNED"
    ROLE_REMOVED = "ROLE_REMOVED"
    PERMISSION_CHANGED = "PERMISSION_CHANGED"


class AuditEntityType(enum.StrEnum):
    """What kind of thing an audit event is about. ``Asset`` / ``Incident`` /
    ``Authentication`` are emitted today; the rest are reserved."""

    ASSET = "Asset"
    INCIDENT = "Incident"
    AUTHENTICATION = "Authentication"
    USER = "User"
    ROLE = "Role"
    RELATIONSHIP = "Relationship"
    # --- reserved ---
    PERMISSION = "Permission"


#: Substrings that mark a field name as sensitive. If a field name contains any
#: of these (case-insensitively), its value is **never** persisted to the audit
#: log - the change row records the field name with a ``[redacted]`` marker
#: instead. Defense-in-depth: none of the fields actually audited today are
#: sensitive, but this guarantees future entities cannot leak credentials.
SENSITIVE_FIELD_TOKENS: tuple[str, ...] = (
    "password",
    "passwd",
    "pwd",
    "hash",
    "token",
    "jwt",
    "secret",
    "cookie",
    "authorization",
    "credential",
    "api_key",
    "apikey",
    "refresh",
    "private_key",
    "signing_key",
    "session_id",
)

#: The literal stored in place of any sensitive value.
REDACTED = "[redacted]"

ENTITY_ID_MAX_LENGTH = 64
ENTITY_LABEL_MAX_LENGTH = 300
ACTOR_EMAIL_MAX_LENGTH = 320
REQUEST_ID_MAX_LENGTH = 64
IP_ADDRESS_MAX_LENGTH = 45
USER_AGENT_MAX_LENGTH = 500
FIELD_NAME_MAX_LENGTH = 100
#: Serialized values longer than this are truncated (with an ellipsis marker).
VALUE_MAX_LENGTH = 8000


def _in_check(column: str, enum_cls: type[enum.StrEnum], name: str) -> CheckConstraint:
    values = [member.value for member in enum_cls]
    assert all("'" not in v for v in values), "audit vocab must not contain quotes"
    rendered = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({rendered})", name=name)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        _in_check("action", AuditAction, "action_valid"),
        _in_check("entity_type", AuditEntityType, "entity_type_valid"),
        Index("ix_audit_events_occurred_at", "occurred_at"),
        Index("ix_audit_events_actor_user_id", "actor_user_id"),
        Index("ix_audit_events_action", "action"),
        Index("ix_audit_events_entity_type", "entity_type"),
        Index("ix_audit_events_entity_id", "entity_id"),
        # "everything about this record" - the Trash / entity-history lookup.
        Index("ix_audit_events_entity_type_entity_id", "entity_type", "entity_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    action: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    #: Loose reference (no FK) - the audited record may later be deleted.
    entity_id: Mapped[str | None] = mapped_column(
        String(ENTITY_ID_MAX_LENGTH), nullable=True
    )
    entity_label: Mapped[str | None] = mapped_column(
        String(ENTITY_LABEL_MAX_LENGTH), nullable=True
    )

    #: Actor snapshot - the FK is nullable and ``SET NULL`` on user delete, but
    #: ``actor_email`` preserves "who" independently of the users table.
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_email: Mapped[str | None] = mapped_column(
        String(ACTOR_EMAIL_MAX_LENGTH), nullable=True
    )

    request_id: Mapped[str | None] = mapped_column(
        String(REQUEST_ID_MAX_LENGTH), nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(IP_ADDRESS_MAX_LENGTH), nullable=True
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(USER_AGENT_MAX_LENGTH), nullable=True
    )

    #: Small structured summary (e.g. a CREATE's key attributes, a
    #: RELATION_CHANGED's added/removed labels). **Never** a request body or a
    #: secret - it is scrubbed on write.
    event_metadata: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return (
            f"<AuditEvent {self.action} {self.entity_type}:{self.entity_id} "
            f"by={self.actor_email!r}>"
        )


class AuditChange(Base):
    __tablename__ = "audit_changes"
    __table_args__ = (
        CheckConstraint("char_length(field_name) > 0", name="field_name_not_empty"),
        Index("ix_audit_changes_audit_event_id", "audit_event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    audit_event_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("audit_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_name: Mapped[str] = mapped_column(String(FIELD_NAME_MAX_LENGTH), nullable=False)
    #: Safe serialized representation. ``NULL`` means the field was actually
    #: ``null`` (distinct from the string ``"null"``).
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<AuditChange {self.field_name}: {self.old_value!r} -> {self.new_value!r}>"
