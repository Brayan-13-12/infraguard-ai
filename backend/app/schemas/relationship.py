"""Request/response schemas for the Asset Relationships API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.relationship import DESCRIPTION_MAX_LENGTH, RelationshipType

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50


class AssetSummaryRead(BaseModel):
    """Safe, minimal Asset projection embedded in a relationship response - never
    the full :class:`~app.schemas.asset.AssetRead` (avoids over-fetching and
    keeps the relationship payload small)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    hostname: str | None
    asset_type: str
    environment: str
    criticality: str
    status: str
    is_active: bool


class RelationshipCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_asset_id: uuid.UUID
    target_asset_id: uuid.UUID
    relationship_type: RelationshipType
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)

    @model_validator(mode="after")
    def _no_self_link(self) -> RelationshipCreate:
        if self.source_asset_id == self.target_asset_id:
            raise ValueError("source_asset_id and target_asset_id must be different")
        return self

    @model_validator(mode="after")
    def _clean_description(self) -> RelationshipCreate:
        if self.description is not None:
            cleaned = self.description.strip()
            object.__setattr__(self, "description", cleaned or None)
        return self


class RelationshipUpdate(BaseModel):
    """Partial update. Only ``relationship_type`` / ``description`` are
    editable - source/target are immutable through PATCH (§13): delete the
    edge and create a new one if it needs to point elsewhere."""

    model_config = ConfigDict(extra="forbid")

    relationship_type: RelationshipType | None = None
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    #: True once the client actually sent ``description`` (distinguishes "clear
    #: it" from "leave it alone") - mirrors the ``exclude_unset`` pattern used
    #: elsewhere in the codebase via ``model_dump(exclude_unset=True)``.


class RelationshipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_asset_id: uuid.UUID
    target_asset_id: uuid.UUID
    relationship_type: RelationshipType
    description: str | None
    created_at: datetime
    updated_at: datetime


class RelationshipDetail(RelationshipRead):
    """A relationship with both endpoint Assets embedded - what the list /
    grouped / detail endpoints actually return, so the frontend never has to
    issue a follow-up fetch per edge."""

    source: AssetSummaryRead
    target: AssetSummaryRead


class RelationshipPage(BaseModel):
    items: list[RelationshipDetail]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class RelationshipCounts(BaseModel):
    outgoing: int = Field(ge=0)
    incoming: int = Field(ge=0)
    total: int = Field(ge=0)


class AssetRelationshipsGrouped(BaseModel):
    """The Dependencias-tab shape: this Asset's own edges grouped by direction."""

    outgoing: list[RelationshipDetail]
    incoming: list[RelationshipDetail]
    counts: RelationshipCounts


class RelationshipTypeInfo(BaseModel):
    """One entry of the relationship-type catalog, for frontend labels /
    the Add-relationship type select - a single source of truth."""

    code: str
    label: str
    inverse_label: str
    description: str
    category: str
    directed: bool = True
    propagates_impact: bool


class RelationshipTypeCatalog(BaseModel):
    types: list[RelationshipTypeInfo]


class RelationshipSummary(BaseModel):
    """Restrained global stats for the Dependencias module header - not a
    dashboard. ``assets_without_relationships`` is included since it is a
    single cheap extra count, not a wider aggregation."""

    total: int = Field(ge=0)
    connected_assets: int = Field(ge=0)
    relationship_types: int = Field(ge=0)
    assets_without_relationships: int = Field(ge=0)


class MessageResponse(BaseModel):
    detail: str
