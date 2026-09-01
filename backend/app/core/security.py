"""Password hashing (Argon2id) and JWT access tokens.

Design notes
------------
* Passwords are hashed with Argon2id using ``argon2-cffi``'s recommended default
  parameters. We do not hand-pick cryptographic parameters.
* Access tokens are short-lived HS256 JWTs. The signing secret comes from
  configuration and is validated on startup in production (see ``config.py``).
* Nothing here logs a password, a hash or the signing secret.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from jwt import InvalidTokenError

from app.core.config import settings

# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
_hasher = PasswordHasher()

# A valid Argon2 hash of a random value. Used to spend comparable CPU time when
# authenticating a non-existent user, so response timing does not leak whether
# an email is registered.
_DUMMY_HASH = _hasher.hash(uuid.uuid4().hex)


def hash_password(password: str) -> str:
    """Return an Argon2id hash. The plaintext is never stored or logged."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-ish time verification. Always burns a hash even on no match."""
    target = password_hash or _DUMMY_HASH
    try:
        _hasher.verify(target, password)
        return password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True if the stored hash uses out-of-date parameters and should be renewed."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


# ---------------------------------------------------------------------------
# JWT access tokens
# ---------------------------------------------------------------------------
_REQUIRED_CLAIMS = ("sub", "exp", "iat", "jti")


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired or otherwise invalid."""


def create_access_token(subject: str) -> tuple[str, datetime]:
    """Return ``(encoded_jwt, expires_at)`` for the given subject (user id)."""
    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": settings.JWT_ISSUER,
        "type": "access",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    """Validate signature, expiry, issuer and required claims. Raise TokenError."""
    if not token:
        raise TokenError("missing token")
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            options={"require": list(_REQUIRED_CLAIMS)},
        )
    except InvalidTokenError as exc:  # expired, bad signature, malformed, ...
        raise TokenError(str(exc)) from exc

    if claims.get("type") != "access":
        raise TokenError("wrong token type")
    return claims
