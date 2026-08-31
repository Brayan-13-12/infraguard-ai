"""Tests for configuration safety, especially production fail-safety.

Every ``Settings`` here is built with ``_env_file=None`` so the suite is
hermetic and never picks up a developer's repo-root ``.env``.
"""

from __future__ import annotations

import pytest

from app.core.config import ConfigurationError, Settings

_SECURE_PW = "S3cure-Prod-Passw0rd!"
_SECURE_URL = f"postgresql+psycopg://appuser:{_SECURE_PW}@db.internal:5432/infraguard"


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def _prod(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "ENVIRONMENT": "production",
        "DATABASE_URL": _SECURE_URL,
        "BACKEND_CORS_ORIGINS": "https://app.example.com",
    }
    base.update(overrides)
    return _settings(**base)


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


def test_production_accepts_secure_configuration() -> None:
    s = _prod()
    assert s.ENVIRONMENT == "production"
    assert s.sqlalchemy_database_uri == _SECURE_URL


def test_timeout_must_be_positive_and_bounded() -> None:
    with pytest.raises(ValueError):
        _settings(DB_HEALTHCHECK_TIMEOUT=0)
    with pytest.raises(ValueError):
        _settings(DB_HEALTHCHECK_TIMEOUT=120)


def test_cors_accepts_comma_separated_string() -> None:
    s = _settings(BACKEND_CORS_ORIGINS="http://localhost:3000, http://localhost:3001")
    assert s.BACKEND_CORS_ORIGINS == ["http://localhost:3000", "http://localhost:3001"]


def test_database_url_password_is_url_encoded_when_assembled() -> None:
    s = _settings(DATABASE_URL=None, POSTGRES_PASSWORD="p@ss/word", POSTGRES_HOST="db")
    assert "p%40ss%2Fword" in s.sqlalchemy_database_uri
