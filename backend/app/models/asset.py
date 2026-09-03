"""The ``Asset`` entity - InfraGuard's first business-domain model.

An asset is any tracked piece of infrastructure: a server, VM, database,
application, network device, container, Kubernetes cluster or cloud resource.

Deliberately flat for this milestone: identity + classification + a few network
details + lifecycle. Dependencies, incidents, health telemetry and obsolescence
are later phases and are **not** modelled here.

Catalog values (``asset_type``, ``environment``, ``criticality``, ``status``) are
small, stable enumerations. They are stored as their English string value and
constrained by a database ``CHECK`` built from the ``StrEnum`` below - no
separate catalog tables (overkill for a fixed vocabulary) and no native
PostgreSQL ``ENUM`` type (which needs a migration to extend). Display
translation happens in the frontend.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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


class AssetType(enum.StrEnum):
    SERVER = "Server"
    VIRTUAL_MACHINE = "Virtual Machine"
    DATABASE = "Database"
    APPLICATION = "Application"
    NETWORK_DEVICE = "Network Device"
    CONTAINER = "Container"
    KUBERNETES_CLUSTER = "Kubernetes Cluster"
    CLOUD_RESOURCE = "Cloud Resource"


class Environment(enum.StrEnum):
    PRODUCTION = "Production"
    STAGING = "Staging"
    DEVELOPMENT = "Development"
    TEST = "Test"


class Criticality(enum.StrEnum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class AssetStatus(enum.StrEnum):
    OPERATIONAL = "Operational"
    DEGRADED = "Degraded"
    MAINTENANCE = "Maintenance"
    OFFLINE = "Offline"


# Field length bounds - also mirrored by the Pydantic schemas.
NAME_MAX_LENGTH = 200
HOSTNAME_MAX_LENGTH = 253  # RFC 1035 maximum domain name length
IP_ADDRESS_MAX_LENGTH = 45  # longest possible IPv6 textual form
OWNER_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 2000


def _in_check(column: str, enum_cls: type[enum.StrEnum], name: str) -> CheckConstraint:
    """Build ``CHECK (<column> IN ('A', 'B', ...))`` from an enum's values."""
    values = [member.value for member in enum_cls]
    assert all("'" not in v for v in values), "catalog values must not contain quotes"
    rendered = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({rendered})", name=name)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        CheckConstraint("char_length(name) > 0", name="name_not_empty"),
        _in_check("asset_type", AssetType, "asset_type_valid"),
        _in_check("environment", Environment, "environment_valid"),
        _in_check("criticality", Criticality, "criticality_valid"),
        _in_check("status", AssetStatus, "status_valid"),
        Index("ix_assets_name", "name"),
        Index("ix_assets_asset_type", "asset_type"),
        Index("ix_assets_environment", "environment"),
        Index("ix_assets_criticality", "criticality"),
        Index("ix_assets_status", "status"),
        Index("ix_assets_is_active", "is_active"),
        Index("ix_assets_created_at", "created_at"),
        # Every normal query filters ``deleted_at IS NULL``; Trash filters the
        # opposite. A partial index keeps the common "active" scan cheap.
        Index(
            "ix_assets_deleted_at",
            "deleted_at",
            postgresql_where=text("deleted_at IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(40), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    criticality: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    hostname: Mapped[str | None] = mapped_column(String(HOSTNAME_MAX_LENGTH), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(IP_ADDRESS_MAX_LENGTH), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(OWNER_MAX_LENGTH), nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    # --- Soft delete (Trash) -------------------------------------------------
    # ``deleted_at IS NULL`` -> live record; a timestamp -> moved to Trash and
    # excluded from every normal query / summary / picker. Restorable with the
    # same id and full history. ``deleted_by`` is a snapshot FK (SET NULL if the
    # user is later removed); the actor is always the authenticated session,
    # never a request-body value.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
        return f"<Asset id={self.id!s} name={self.name!r} active={self.is_active}>"
