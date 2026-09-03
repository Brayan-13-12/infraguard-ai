"""Role-Based Access Control (Governance & Administration - Phase 3).

A normalized RBAC model. **Frontend visibility is not security** - every
permission is enforced here, in the backend; the frontend only mirrors what this
layer already allows.

```
User ── UserRole ──▶ Role ── RolePermission ──▶ Permission
```

* :class:`Permission` - one row per backend capability (``assets.read`` …). The
  ``code`` is a **stable machine identifier**; it is never translated.
* :class:`Role` - a named bundle of permissions. ``is_system`` roles
  (Administrator / Operator / Analyst / Viewer) are seeded by migration, cannot
  be deleted, and their identity + permission set are owned by code (see
  :mod:`app.services.rbac`). Custom roles are created/edited by administrators.
* :class:`UserRole` - a user is assigned zero or more roles. ``assigned_by`` is
  a snapshot of who made the assignment (nullable; ``SET NULL`` on user delete).
* :class:`RolePermission` - the permissions granted by a role.

A user's **effective permissions** are the *union* of the permissions of every
role assigned to them. There are no per-user grants and no deny rules in this
milestone (see docs/architecture.md for what is deferred).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

#: Length cap for a permission code (``domain.action``).
PERMISSION_CODE_MAX_LENGTH = 100
#: Length caps for role fields.
ROLE_NAME_MAX_LENGTH = 80
ROLE_SLUG_MAX_LENGTH = 80
DESCRIPTION_MAX_LENGTH = 300


class Permission(Base):
    """One backend capability. Seeded from :data:`app.services.rbac.PERMISSION_CATALOG`."""

    __tablename__ = "permissions"
    __table_args__ = (
        CheckConstraint("char_length(code) > 0", name="code_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(
        String(PERMISSION_CODE_MAX_LENGTH), unique=True, nullable=False
    )
    description: Mapped[str] = mapped_column(String(DESCRIPTION_MAX_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Permission {self.code}>"


class Role(Base):
    """A named bundle of permissions."""

    __tablename__ = "roles"
    __table_args__ = (
        CheckConstraint("char_length(name) > 0", name="name_not_empty"),
        CheckConstraint("char_length(slug) > 0", name="slug_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    #: Human-facing name (unique, case-sensitive). System roles keep a stable name.
    name: Mapped[str] = mapped_column(String(ROLE_NAME_MAX_LENGTH), unique=True, nullable=False)
    #: Stable machine identifier (``administrator`` …). Never translated.
    slug: Mapped[str] = mapped_column(String(ROLE_SLUG_MAX_LENGTH), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(
        String(DESCRIPTION_MAX_LENGTH), nullable=True
    )
    #: Built-in role - cannot be deleted; identity + permissions owned by code.
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
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

    permissions: Mapped[list[RolePermission]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    user_links: Mapped[list[UserRole]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Role {self.slug} system={self.is_system}>"


class RolePermission(Base):
    """Association: a permission granted by a role. Composite PK prevents dupes."""

    __tablename__ = "role_permissions"
    __table_args__ = (
        # Reverse lookup: "which roles grant this permission".
        Index("ix_role_permissions_permission_id", "permission_id"),
    )

    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship()


class UserRole(Base):
    """Association: a role assigned to a user. Composite PK prevents dupes."""

    __tablename__ = "user_roles"
    __table_args__ = (
        # Reverse lookup: "which users hold this role".
        Index("ix_user_roles_role_id", "role_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    #: Who made the assignment - a snapshot; ``SET NULL`` if that admin is deleted.
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    role: Mapped[Role] = relationship(back_populates="user_links")

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<UserRole user={self.user_id} role={self.role_id}>"
