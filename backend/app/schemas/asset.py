"""Request/response schemas for the Assets API.

The catalog fields reuse the ``StrEnum`` types from the ORM model, so Pydantic
rejects any value outside the vocabulary with a ``422`` (and OpenAPI documents
the allowed values). ``AssetCreate`` / ``AssetUpdate`` set ``extra="forbid"`` so
an unknown field is a client error rather than a silent no-op.
"""

from __future__ import annotations

import ipaddress
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.asset import (
    DESCRIPTION_MAX_LENGTH,
    HOSTNAME_MAX_LENGTH,
    IP_ADDRESS_MAX_LENGTH,
    NAME_MAX_LENGTH,
    OWNER_MAX_LENGTH,
    AssetStatus,
    AssetType,
    Criticality,
    Environment,
)

# Page-size ceiling - guards against unbounded result sets.
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

NameField = Annotated[str, Field(min_length=1, max_length=NAME_MAX_LENGTH)]
HostnameField = Annotated[str | None, Field(default=None, max_length=HOSTNAME_MAX_LENGTH)]
IpField = Annotated[str | None, Field(default=None, max_length=IP_ADDRESS_MAX_LENGTH)]
OwnerField = Annotated[str | None, Field(default=None, max_length=OWNER_MAX_LENGTH)]
DescriptionField = Annotated[str | None, Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)]


def _clean_optional(value: str | None) -> str | None:
    """Trim whitespace; treat an empty/whitespace-only string as "not provided"."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _validate_ip(value: str | None) -> str | None:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return None
    try:
        return str(ipaddress.ip_address(cleaned))
    except ValueError as exc:
        raise ValueError("must be a valid IPv4 or IPv6 address") from exc


class AssetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: NameField
    asset_type: AssetType
    environment: Environment
    criticality: Criticality
    status: AssetStatus
    hostname: HostnameField
    ip_address: IpField
    owner: OwnerField
    description: DescriptionField

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("hostname", "owner", "description")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @field_validator("ip_address")
    @classmethod
    def _check_ip(cls, v: str | None) -> str | None:
        return _validate_ip(v)


class AssetUpdate(BaseModel):
    """Partial update. Every field is optional; unknown fields are rejected.

    ``is_active`` is intentionally absent - lifecycle changes go through the
    dedicated ``/deactivate`` and ``/reactivate`` endpoints.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX_LENGTH)
    asset_type: AssetType | None = None
    environment: Environment | None = None
    criticality: Criticality | None = None
    status: AssetStatus | None = None
    hostname: HostnameField
    ip_address: IpField
    owner: OwnerField
    description: DescriptionField

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("hostname", "owner", "description")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @field_validator("ip_address")
    @classmethod
    def _check_ip(cls, v: str | None) -> str | None:
        return _validate_ip(v)


class AssetRead(BaseModel):
    """Full public projection of an asset."""

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


class AssetPage(BaseModel):
    """A page of assets with pagination metadata."""

    items: list[AssetRead]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class MessageResponse(BaseModel):
    detail: str
