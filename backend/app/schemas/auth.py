"""Request/response schemas for authentication.

``password_hash`` never appears in any schema, so it can never be serialized
into a response.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.config import settings
from app.services.users import normalize_email


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=settings.PASSWORD_MAX_LENGTH,
        description=(
            f"{settings.PASSWORD_MIN_LENGTH}-{settings.PASSWORD_MAX_LENGTH} characters. "
            "Passphrases and password managers are encouraged; nothing is truncated."
        ),
    )

    @field_validator("email")
    @classmethod
    def _email_canonical(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("password")
    @classmethod
    def _password_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("password must not be blank")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=settings.PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def _email_canonical(cls, v: str) -> str:
        return normalize_email(v)


class UserPublic(BaseModel):
    """Safe public projection of a user. No password material, ever.

    Returned by ``login``. ``GET /auth/me`` returns the richer
    :class:`CurrentUser` (roles + effective permissions + account status).
    """

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleRef(BaseModel):
    """Minimal role identity for the current-user payload."""

    id: uuid.UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}


class CurrentUser(BaseModel):
    """The authenticated user's identity **and effective authorization state**.

    Only an ``active`` account can ever reach this endpoint, so ``account_status``
    is always ``"active"`` here - it is included for completeness / symmetry with
    the admin views. ``permissions`` is the union of the permissions of every
    assigned role - the exact set the backend enforces. The frontend uses it only
    to mirror what is already allowed here; it is never the security boundary.
    """

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    account_status: str
    created_at: datetime
    roles: list[RoleRef]
    permissions: list[str]


class MessageResponse(BaseModel):
    detail: str


class AccessRequestResponse(BaseModel):
    """Response to ``POST /auth/register`` - a submitted **access request**, not
    an account the caller can use yet."""

    detail: str
    account_status: str = "pending"
