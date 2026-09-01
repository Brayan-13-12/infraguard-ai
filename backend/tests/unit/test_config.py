"""Tests for configuration safety, especially production fail-safety.

Every ``Settings`` here is built with ``_env_file=None`` so the suite is
hermetic and never picks up a developer's repo-root ``.env``.
"""

from __future__ import annotations

import pytest

from app.core.config import ConfigurationError, Settings

_SECURE_PW = "S3cure-Prod-Passw0rd!"
_SECURE_URL = f"postgresql+psycopg://appuser:{_SECURE_PW}@db.internal:5432/infraguard"
_SECURE_JWT = "x7Qw9Zt2Lp4Rm8Vc1Nb6Yh3Kj5Fd0Ss-really-random"


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def _prod(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "ENVIRONMENT": "production",
        "DATABASE_URL": _SECURE_URL,
        "BACKEND_CORS_ORIGINS": "https://app.example.com",
        "JWT_SECRET": _SECURE_JWT,
        "AUTH_COOKIE_SECURE": True,
    }
    base.update(overrides)
    return _settings(**base)


# --- Database credentials -----------------------------------------------

def test_development_allows_placeholder_credentials() -> None:
    s = _settings(
        ENVIRONMENT="development",
        POSTGRES_PASSWORD="change_me_for_local_development",
    )
    assert s.ENVIRONMENT == "development"


def test_production_rejects_placeholder_password() -> None:
    with pytest.raises(ConfigurationError, match="placeholder"):
        _prod(
            DATABASE_URL=None,
            POSTGRES_USER="appuser",
            POSTGRES_PASSWORD="change_me_for_local_development",
        )


def test_production_rejects_short_password() -> None:
    with pytest.raises(ConfigurationError, match="12 characters"):
        _prod(DATABASE_URL=None, POSTGRES_USER="appuser", POSTGRES_PASSWORD="short1!")


def test_production_rejects_placeholder_password_inside_database_url() -> None:
    with pytest.raises(ConfigurationError, match="placeholder"):
        _prod(DATABASE_URL="postgresql+psycopg://appuser:postgres@db:5432/infraguard")


def test_production_rejects_default_user_when_assembling_url() -> None:
    with pytest.raises(ConfigurationError, match="user"):
        _prod(DATABASE_URL=None, POSTGRES_USER="infraguard", POSTGRES_PASSWORD=_SECURE_PW)


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ConfigurationError, match="wildcard CORS"):
        _prod(BACKEND_CORS_ORIGINS="*")


# --- JWT secret --------------------------------------------------------

def test_development_allows_placeholder_jwt_secret() -> None:
    s = _settings(ENVIRONMENT="development")
    assert s.JWT_SECRET  # default placeholder is fine outside production


def test_production_rejects_placeholder_jwt_secret() -> None:
    with pytest.raises(ConfigurationError, match="JWT_SECRET"):
        _prod(JWT_SECRET="dev-insecure-jwt-secret-change-me")


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ConfigurationError, match="JWT_SECRET must be at least"):
        _prod(JWT_SECRET="tooshort")


def test_production_rejects_insecure_cookie() -> None:
    with pytest.raises(ConfigurationError, match="AUTH_COOKIE_SECURE"):
        _prod(AUTH_COOKIE_SECURE=False)


def test_production_accepts_secure_configuration() -> None:
    s = _prod()
    assert s.ENVIRONMENT == "production"
    assert s.sqlalchemy_database_uri == _SECURE_URL
    assert s.auth_cookie_secure is True


# --- Misc bounds ------------------------------------------------------

def test_timeout_must_be_positive_and_bounded() -> None:
    with pytest.raises(ValueError):
        _settings(DB_HEALTHCHECK_TIMEOUT=0)
    with pytest.raises(ValueError):
        _settings(DB_HEALTHCHECK_TIMEOUT=120)


def test_jwt_expiry_must_be_bounded() -> None:
    with pytest.raises(ValueError):
        _settings(JWT_ACCESS_TOKEN_EXPIRE_MINUTES=0)
    with pytest.raises(ValueError):
        _settings(JWT_ACCESS_TOKEN_EXPIRE_MINUTES=5000)


def test_cookie_secure_defaults_follow_environment() -> None:
    assert _settings(ENVIRONMENT="development").auth_cookie_secure is False
    # production default requires a full secure config, so check via _prod()
    assert _prod(AUTH_COOKIE_SECURE=None).auth_cookie_secure is True


def test_cors_accepts_comma_separated_string() -> None:
    s = _settings(BACKEND_CORS_ORIGINS="http://localhost:3000, http://localhost:3001")
    assert s.BACKEND_CORS_ORIGINS == ["http://localhost:3000", "http://localhost:3001"]


def test_database_url_password_is_url_encoded_when_assembled() -> None:
    s = _settings(DATABASE_URL=None, POSTGRES_PASSWORD="p@ss/word", POSTGRES_HOST="db")
    assert "p%40ss%2Fword" in s.sqlalchemy_database_uri
