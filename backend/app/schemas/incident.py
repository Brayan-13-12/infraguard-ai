"""Request/response schemas for the Incidents API.

Catalog fields reuse the ``StrEnum`` types from the ORM model, so Pydantic
rejects any value outside the vocabulary with a ``422``. ``IncidentCreate`` /
``IncidentUpdate`` set ``extra="forbid"`` so an unknown field is a client error.

Fields the client must never set are simply absent from the input models:

* ``created_by``  - derived from the authenticated user in the route.
* ``resolved_at`` - derived from ``status`` transitions by the service layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.asset import AssetStatus, AssetType, Criticality, Environment
from app.models.incident import (
    DESCRIPTION_MAX_LENGTH,
    EVENT_MESSAGE_MAX_LENGTH,
    OWNER_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    IncidentEventType,
    IncidentPriority,
    IncidentSeverity,
    IncidentStatus,
)
from app.schemas.asset import MessageResponse

__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_ASSET_LINKS",
    "MAX_PAGE_SIZE",
    "IncidentAssetRef",
    "IncidentCreate",
    "IncidentEventRead",
    "IncidentListItem",
    "IncidentPage",
    "IncidentRead",
    "IncidentSummary",
    "IncidentUpdate",
    "MessageResponse",
]

MAX_PAGE_SIZE = 100
# Incident rows are denser than asset rows (title + severity + status + priority
# + affected count + owner + two dates); 15 keeps the first page scannable.
DEFAULT_PAGE_SIZE = 15
# Upper bound on affected assets linked in a single request - guards the
# association writes and the ASSET_ADDED/ASSET_REMOVED event fan-out.
MAX_ASSET_LINKS = 200

TitleField = Annotated[str, Field(min_length=1, max_length=TITLE_MAX_LENGTH)]
OwnerField = Annotated[str | None, Field(default=None, max_length=OWNER_MAX_LENGTH)]
DescriptionField = Annotated[
    str | None, Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
]
AssetIdsField = Annotated[
    list[uuid.UUID], Field(default_factory=list, max_length=MAX_ASSET_LINKS)
]
CommentField = Annotated[str, Field(min_length=1, max_length=EVENT_MESSAGE_MAX_LENGTH)]


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _dedupe(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


class IncidentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: TitleField
    description: DescriptionField
    severity: IncidentSeverity
    priority: IncidentPriority
    status: IncidentStatus = IncidentStatus.OPEN
    owner: OwnerField
    started_at: datetime | None = None
    detected_at: datetime | None = None
    asset_ids: AssetIdsField

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("owner", "description")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @field_validator("asset_ids")
    @classmethod
    def _dedupe_assets(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        return _dedupe(v)


class IncidentUpdate(BaseModel):
    """Partial update. Every field is optional; unknown fields are rejected.

    ``asset_ids`` semantics: **omitted** -> affected assets untouched; provided
    (even ``[]``) -> the affected-asset set is replaced with exactly that list,
    emitting ASSET_ADDED / ASSET_REMOVED timeline events for the difference.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX_LENGTH)
    description: DescriptionField
    severity: IncidentSeverity | None = None
    priority: IncidentPriority | None = None
    status: IncidentStatus | None = None
    owner: OwnerField
    started_at: datetime | None = None
    detected_at: datetime | None = None
    asset_ids: list[uuid.UUID] | None = Field(default=None, max_length=MAX_ASSET_LINKS)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("owner", "description")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @field_validator("asset_ids")
    @classmethod
    def _dedupe_assets(cls, v: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        return None if v is None else _dedupe(v)


class IncidentCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: CommentField

    @field_validator("message")
    @classmethod
    def _strip(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class IncidentAssetRef(BaseModel):
    """Compact projection of an affected asset, embedded in the incident detail.

    ``deleted_at`` is non-null when the asset has been moved to Trash: the
    persisted relationship is kept (history), and the UI badges it "En papelera"
    rather than dropping it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    asset_type: AssetType
    environment: Environment
    criticality: Criticality
    status: AssetStatus
    is_active: bool
    deleted_at: datetime | None = None


class IncidentEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: IncidentEventType
    message: str
    created_by: uuid.UUID | None
    actor_email: str | None = None
    created_at: datetime


class IncidentListItem(BaseModel):
    """A row in the incidents list - no description, no timeline."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    severity: IncidentSeverity
    status: IncidentStatus
    priority: IncidentPriority
    owner: str | None
    started_at: datetime
    detected_at: datetime | None
    resolved_at: datetime | None
    affected_asset_count: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime


class IncidentRead(BaseModel):
    """Full incident detail: metadata + affected assets + timeline."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    severity: IncidentSeverity
    status: IncidentStatus
    priority: IncidentPriority
    owner: str | None
    started_at: datetime
    detected_at: datetime | None
    resolved_at: datetime | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    affected_assets: list[IncidentAssetRef]
    timeline: list[IncidentEventRead]


class IncidentPage(BaseModel):
    items: list[IncidentListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class IncidentSummary(BaseModel):
    """Aggregate incident counts for the Dashboard. Read-only, derived from the
    ``incidents`` table. Every catalog key is present even when its count is zero.
    """

    total: int = Field(ge=0)
    open: int = Field(ge=0)
    critical_open: int = Field(ge=0)
    investigating: int = Field(ge=0)
    monitoring: int = Field(ge=0)
    resolved_recently: int = Field(ge=0)
    by_severity: dict[str, int]
    by_status: dict[str, int]
