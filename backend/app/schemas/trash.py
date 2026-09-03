"""Request/response schemas for the Trash API (Governance & Administration - Phase 2).

Trash is a **dedicated read path** for soft-deleted records. Normal Asset /
Incident schemas are reused where possible; the extra ``deleted_at`` /
``deleted_by`` / ``deleted_by_email`` fields only ever appear here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.asset import AssetStatus, AssetType, Criticality, Environment
from app.models.incident import IncidentPriority, IncidentSeverity, IncidentStatus
from app.schemas.incident import IncidentEventRead

# Trash pages are lighter than the operational lists; keep them scannable.
ASSETS_DEFAULT_PAGE_SIZE = 20
INCIDENTS_DEFAULT_PAGE_SIZE = 15
MAX_PAGE_SIZE = 100


class _DeletedMeta(BaseModel):
    """The 'who / when' every trashed row carries."""

    deleted_at: datetime
    deleted_by: uuid.UUID | None
    deleted_by_email: str | None


# --- Assets --------------------------------------------------------------


class TrashAssetListItem(_DeletedMeta):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    asset_type: AssetType
    environment: Environment
    criticality: Criticality
    status: AssetStatus


class TrashAssetDetail(_DeletedMeta):
    """Full read-only projection of a trashed asset - everything the operator
    needs to decide whether to restore it."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    asset_type: AssetType
    environment: Environment
    criticality: Criticality
    status: AssetStatus
    hostname: str | None
    ip_address: str | None
    owner: str | None
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TrashAssetPage(BaseModel):
    items: list[TrashAssetListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


# --- Incidents ---------------------------------------------------------


class TrashIncidentListItem(_DeletedMeta):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    severity: IncidentSeverity
    status: IncidentStatus
    priority: IncidentPriority
    owner: str | None
    affected_asset_count: int = Field(ge=0)


class TrashIncidentAssetRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    asset_type: AssetType
    environment: Environment
    criticality: Criticality
    status: AssetStatus
    is_active: bool
    deleted_at: datetime | None = None


class TrashIncidentDetail(_DeletedMeta):
    """Full read-only projection of a trashed incident, with its **preserved**
    timeline and affected-asset relationships."""

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
    affected_assets: list[TrashIncidentAssetRef]
    timeline: list[IncidentEventRead]


class TrashIncidentPage(BaseModel):
    items: list[TrashIncidentListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


# --- Summary ----------------------------------------------------------


class TrashSummary(BaseModel):
    """Compact counters for the Trash header - a recovery workspace, not a
    dashboard."""

    assets: int = Field(ge=0)
    incidents: int = Field(ge=0)
