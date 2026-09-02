"""Unit tests for password hashing and JWT handling (no database)."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.config import settings
from app.core.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

# --- Password hashing --------------------------------------------------

def test_hash_is_argon2id_and_not_plaintext() -> None:
    digest = hash_password("correct horse battery staple")
    assert digest.startswith("$argon2id$")
    assert "correct horse battery staple" not in digest


def test_hash_is_salted_unique() -> None:
    assert hash_password("same-password-123") != hash_password("same-password-123")


def test_verify_roundtrip() -> None:
    digest = hash_password("s3cret-passphrase!!")
    assert verify_password("s3cret-passphrase!!", digest) is True
    assert verify_password("wrong", digest) is False


def test_verify_against_missing_hash_is_false_but_spends_time() -> None:
    start = time.perf_counter()
    assert verify_password("anything", None) is False
    # Argon2 verify against the dummy hash is not free (mitigates user enumeration).
    assert time.perf_counter() - start > 0.001


# --- JWT --------------------------------------------------------------

def test_access_token_roundtrip_has_expected_claims() -> None:
    token, expires_at = create_access_token(subject="abc-123")
    claims = decode_access_token(token)
    assert claims["sub"] == "abc-123"
    assert claims["type"] == "access"
    assert {"iat", "exp", "jti", "nbf", "iss"} <= claims.keys()
    assert claims["iss"] == settings.JWT_ISSUER
    assert abs(claims["exp"] - int(expires_at.timestamp())) <= 1


def test_default_session_lifetime_is_30_minutes() -> None:
    # Hermetic: the *default* (config field), independent of any repo-root .env.
    from app.core.config import Settings

    fresh = Settings(_env_file=None)  # type: ignore[call-arg]
    assert fresh.JWT_ACCESS_TOKEN_EXPIRE_MINUTES == 30
    assert fresh.access_token_expires_seconds == 1800


def test_token_exp_matches_the_configured_lifetime() -> None:
    # Mechanism: the JWT `exp - iat` is exactly the configured minutes, and the
    # cookie Max-Age uses the same derived value (one source of truth).
    token, _ = create_access_token(subject="abc-123")
    claims = decode_access_token(token)
    assert claims["exp"] - claims["iat"] == settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert settings.access_token_expires_seconds == settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60


def test_password_is_never_in_token() -> None:
    token, _ = create_access_token(subject="u1")
    assert "password" not in token.lower()


def test_expired_token_is_rejected() -> None:
    payload = {
        "sub": "u1",
        "iat": int((datetime.now(tz=UTC) - timedelta(hours=2)).timestamp()),
        "nbf": int((datetime.now(tz=UTC) - timedelta(hours=2)).timestamp()),
        "exp": int((datetime.now(tz=UTC) - timedelta(hours=1)).timestamp()),
        "jti": "x",
        "iss": settings.JWT_ISSUER,
        "type": "access",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    with pytest.raises(TokenError):
        decode_access_token(token)


def test_bad_signature_is_rejected() -> None:
    token, _ = create_access_token(subject="u1")
    tampered = jwt.encode(
        jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], issuer=settings.JWT_ISSUER),
        "a-different-secret-of-sufficient-length",
        algorithm="HS256",
    )
    with pytest.raises(TokenError):
        decode_access_token(tampered)


def test_malformed_token_is_rejected() -> None:
    for bad in ("", "not-a-jwt", "aaa.bbb.ccc", "Bearer xyz"):
        with pytest.raises(TokenError):
            decode_access_token(bad)


def test_missing_required_claims_is_rejected() -> None:
    token = jwt.encode({"sub": "u1"}, settings.JWT_SECRET, algorithm="HS256")
    with pytest.raises(TokenError):
        decode_access_token(token)


def test_wrong_token_type_is_rejected() -> None:
    now = int(datetime.now(tz=UTC).timestamp())
    token = jwt.encode(
        {
            "sub": "u1",
            "iat": now,
            "nbf": now,
            "exp": now + 300,
            "jti": "x",
            "iss": settings.JWT_ISSUER,
            "type": "refresh",
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(TokenError, match="type"):
        decode_access_token(token)


def test_algorithm_confusion_none_is_rejected() -> None:
    token = jwt.encode({"sub": "u1"}, key="", algorithm="none")
    with pytest.raises(TokenError):
        decode_access_token(token)


def test_dummy_hash_is_a_real_argon2_hash() -> None:
    assert security._DUMMY_HASH.startswith("$argon2id$")
