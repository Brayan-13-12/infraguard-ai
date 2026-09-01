"""Request/response schemas for authentication.

``password_hash`` never appears in any schema, so it can never be serialized
into a response.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.config import settings


def _normalize_email(value: str) -> str:
    return value.strip().lower()


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
    def _email_lower(cls, v: str) -> str:
        return _normalize_email(v)

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
    def _email_lower(cls, v: str) -> str:
        return _normalize_email(v)


class UserPublic(BaseModel):
    """Safe public projection of a user. No password material, ever."""

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    detail: str
