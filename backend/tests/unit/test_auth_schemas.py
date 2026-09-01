"""Unit tests for auth request/response schemas and the password policy."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.auth import LoginRequest, RegisterRequest, UserPublic


def test_register_normalizes_email() -> None:
    req = RegisterRequest(email="  User@Example.COM ", password="a-good-passphrase")
    assert req.email == "user@example.com"


def test_register_rejects_invalid_email() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password="a-good-passphrase")


def test_register_rejects_short_password() -> None:
    short = "x" * (settings.PASSWORD_MIN_LENGTH - 1)
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password=short)


def test_register_rejects_overlong_password_without_truncating() -> None:
    long = "x" * (settings.PASSWORD_MAX_LENGTH + 1)
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password=long)


def test_register_rejects_blank_password() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password="            ")


def test_register_accepts_long_passphrase_up_to_max() -> None:
    pw = "correct horse battery staple " * 3  # ~87 chars, spaces allowed
    req = RegisterRequest(email="a@b.com", password=pw.strip())
    assert req.password == pw.strip()


def test_login_request_normalizes_email_but_allows_any_length_password() -> None:
    req = LoginRequest(email="A@B.COM", password="x")
    assert req.email == "a@b.com"


def test_user_public_has_no_password_fields() -> None:
    fields = set(UserPublic.model_fields)
    assert fields == {"id", "email", "is_active", "created_at"}
    assert "password" not in fields
    assert "password_hash" not in fields


def test_user_public_serialization_excludes_hash_even_if_present_on_source() -> None:
    class FakeUser:
        id = uuid.uuid4()
        email = "user@example.com"
        is_active = True
        created_at = datetime.now(tz=UTC)
        password_hash = "$argon2id$should-never-appear"

    dumped = UserPublic.model_validate(FakeUser()).model_dump()
    assert "password_hash" not in dumped
    assert "$argon2id$" not in str(dumped)
