"""Request/response schemas for User & Role administration (RBAC - Phase 3).

Admin responses carry only **safe administrative metadata** - never a password
hash, token or any auth secret (those fields do not exist on any model here).
Permission *codes* are stable machine identifiers and are never translated; the
frontend renders a Spanish label next to the code.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.rbac import DESCRIPTION_MAX_LENGTH, ROLE_NAME_MAX_LENGTH

# Page-size conventions mirror the rest of the API.
USERS_DEFAULT_PAGE_SIZE = 20
ROLES_DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


# --------------------------------------------------------------------------
# Shared refs
# --------------------------------------------------------------------------


class RoleRef(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_system: bool

    model_config = ConfigDict(from_attributes=True)


class PermissionRead(BaseModel):
    code: str
    group: str
    description: str


class PermissionCatalog(BaseModel):
    """The full permission catalog, grouped for the matrix editor."""

    groups: list[str]
    permissions: list[PermissionRead]


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------


class AdminUserListItem(BaseModel):
    id: uuid.UUID
    email: str
    #: Lifecycle state - ``pending`` / ``active`` / ``rejected`` / ``disabled``.
    account_status: str
    #: Derived (``account_status == active``); kept for convenience.
    is_active: bool
    created_at: datetime
    roles: list[RoleRef]


class AdminUserPage(BaseModel):
    items: list[AdminUserListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class AdminUserDetail(BaseModel):
    id: uuid.UUID
    email: str
    account_status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    roles: list[RoleRef]
    #: Union across assigned roles. For a non-active account these permissions
    #: are **not** in effect - the UI shows them as "will apply once approved /
    #: reactivated" and the backend rejects the account regardless.
    permissions: list[str]
    #: True when this user is the only active Administrator (drives self-lockout
    #: guidance in the UI).
    is_last_active_admin: bool


class AdminUserUpdate(BaseModel):
    """Runtime enable / disable of an already-provisioned account
    (``active`` <-> ``disabled``). Pending / rejected requests go through the
    approve / reject endpoints instead."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool


class UserRolesUpdate(BaseModel):
    """Replace a user's role set with exactly ``role_ids`` (de-duplicated)."""

    model_config = ConfigDict(extra="forbid")

    role_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class ApproveAccessRequest(BaseModel):
    """Approve a pending (or previously rejected) access request. **At least one
    role is required** - approving with none creates an unusable account."""

    model_config = ConfigDict(extra="forbid")

    role_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------


class RoleListItem(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_system: bool
    user_count: int
    permission_count: int


class RolePage(BaseModel):
    items: list[RoleListItem]
    total: int = Field(ge=0)


class RoleUserRef(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class RoleDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_system: bool
    created_at: datetime
    updated_at: datetime
    permissions: list[str]
    users: list[RoleUserRef]


class RoleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=ROLE_NAME_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    permissions: list[str] = Field(default_factory=list, max_length=100)


class RoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=ROLE_NAME_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)


class RolePermissionsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permissions: list[str] = Field(default_factory=list, max_length=100)
