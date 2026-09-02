"""Request/response schemas for the read-only Audit API.

The list projection is deliberately lightweight (metadata about each event + a
``change_count``); the full field-change list and request context are only
returned by the detail endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.audit import AuditAction, AuditEntityType

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25

__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_PAGE_SIZE",
    "AuditAction",
    "AuditChangeRead",
    "AuditEntityType",
    "AuditEventListItem",
    "AuditEventRead",
    "AuditPage",
    "AuditSummary",
    "MessageResponse",
]


class AuditChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    field_name: str
    old_value: str | None
    new_value: str | None


class AuditEventListItem(BaseModel):
    """A row in the audit list.

    Lightweight on purpose: ``change_count`` is the true total, ``change_preview``
    is a **bounded** slice (first few change rows) so the timeline can show what
    changed without a per-row detail request. The full change set stays
    exclusive to :class:`AuditEventRead`.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    action: str
    entity_type: str
    entity_id: str | None
    entity_label: str | None
    actor_user_id: uuid.UUID | None
    actor_email: str | None
    change_count: int = Field(ge=0)
    change_preview: list[AuditChangeRead] = Field(default_factory=list)


class AuditEventRead(BaseModel):
    """Full audit event: actor + entity + request context + field changes.

    Constructed explicitly by the route (``metadata`` comes from the ORM
    attribute ``event_metadata``).
    """

    id: uuid.UUID
    occurred_at: datetime
    action: str
    entity_type: str
    entity_id: str | None
    entity_label: str | None
    actor_user_id: uuid.UUID | None
    actor_email: str | None
    request_id: str | None
    ip_address: str | None
    user_agent: str | None
    metadata: dict | None = None
    changes: list[AuditChangeRead]


class AuditPage(BaseModel):
    items: list[AuditEventListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class AuditSummary(BaseModel):
    """Compact 'activity today' counters for the Audit page header."""

    events_today: int = Field(ge=0)
    changes_today: int = Field(ge=0)
    logins_today: int = Field(ge=0)
    active_actors_today: int = Field(ge=0)


class MessageResponse(BaseModel):
    detail: str
