"""Centralized application configuration.

All configuration is environment-driven. No secrets or credentials are ever
hardcoded here - defaults are limited to non-sensitive local development values.

.env resolution
---------------
The ``.env`` file is resolved by absolute path, anchored to the repository root
(and, as an optional override, ``backend/.env``) - never relative to the current
working directory. This makes ``cd backend && uvicorn ...`` and running from the
repo root behave identically. Explicit environment variables always take
precedence over any ``.env`` value (standard pydantic-settings ordering:
init args > environment > .env > defaults).

Production safety
-----------------
When ``ENVIRONMENT=production`` the settings object refuses to build with
placeholder/default database credentials or a wildcard CORS origin, and fails
fast with a clear server-side error. Secrets in production are expected to be
injected as environment variables (and, in later deployment phases, via
Kubernetes Secrets / an external secret manager - see docs/architecture.md).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy import URL
from sqlalchemy.engine import make_url

_CORE_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CORE_DIR.parents[1]
_REPO_ROOT = _CORE_DIR.parents[2]

# Repo-root .env first, backend/.env second (later files win if both exist).
_ENV_FILES = (_REPO_ROOT / ".env", _BACKEND_DIR / ".env")

# Values that must never be accepted as a real secret in production.
_PLACEHOLDER_SECRETS = frozenset(
    {
        "",
        "change_me",
        "changeme",
        "change_me_for_local_development",
        "postgres",
        "password",
        "secret",
        "admin",
        "root",
        "infraguard",
    }
)
_MIN_PROD_PASSWORD_LEN = 12


class ConfigurationError(RuntimeError):
    """Raised when the runtime configuration is unsafe or incomplete."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        # `extra="forbid"` is impractical here: the repository-root .env is shared
        # with the frontend (e.g. NEXT_PUBLIC_API_URL) and container runtimes
        # inject unrelated variables. Unknown keys are ignored; safety is enforced
        # by the targeted validators below instead.
        extra="ignore",
        case_sensitive=False,
    )

    # --- General ---
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    PROJECT_NAME: str = "InfraGuard AI"
    SERVICE_NAME: str = "infraguard-api"
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    POSTGRES_DB: str = "infraguard"
    POSTGRES_USER: str = "infraguard"
    POSTGRES_PASSWORD: str = "change_me_for_local_development"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = Field(default=5432, gt=0, le=65535)
    # Optional explicit override; when unset it is assembled from the parts above.
    DATABASE_URL: str | None = None

    # Connectivity-check timeout (seconds) used by the readiness probe.
    DB_HEALTHCHECK_TIMEOUT: float = Field(default=3.0, gt=0, le=30)

    # --- CORS ---
    # Comma-separated string (from env) or list. Defaults to the local frontend
    # only. `NoDecode` disables pydantic-settings' JSON parsing so the validator
    # below can accept a plain comma-separated value.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    # ------------------------------------------------------------------
    # Production fail-safety
    # ------------------------------------------------------------------
    @model_validator(mode="after")
    def _enforce_production_safety(self) -> Settings:
        if self.ENVIRONMENT != "production":
            return self

        problems: list[str] = []

        password = self._effective_db_password()
        if password is None:
            problems.append(
                "database password is not set - provide DATABASE_URL or POSTGRES_PASSWORD"
            )
        else:
            if password.lower() in _PLACEHOLDER_SECRETS:
                problems.append(
                    "database password is a well-known placeholder/default value"
                )
            elif len(password) < _MIN_PROD_PASSWORD_LEN:
                problems.append(
                    f"database password must be at least {_MIN_PROD_PASSWORD_LEN} characters"
                )

        if self.DATABASE_URL is None and self.POSTGRES_USER.lower() in _PLACEHOLDER_SECRETS:
            problems.append("database user is a well-known placeholder/default value")

        if any(origin.strip() == "*" for origin in self.BACKEND_CORS_ORIGINS):
            problems.append("wildcard CORS origin ('*') is not allowed in production")
        if not self.BACKEND_CORS_ORIGINS:
            problems.append("BACKEND_CORS_ORIGINS must list at least one explicit origin")

        if problems:
            raise ConfigurationError(
                "Unsafe production configuration: " + "; ".join(problems)
            )
        return self

    def _effective_db_password(self) -> str | None:
        if self.DATABASE_URL:
            try:
                return make_url(self.DATABASE_URL).password
            except Exception:  # pragma: no cover - malformed URL surfaces elsewhere
                return None
        return self.POSTGRES_PASSWORD or None

    # ------------------------------------------------------------------
    # Derived values
    # ------------------------------------------------------------------
    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        # URL.create stores components verbatim and percent-encodes them on
        # render, so passwords containing '@', '/', ':' etc. are handled safely.
        return URL.create(
            "postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            database=self.POSTGRES_DB,
        ).render_as_string(hide_password=False)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def debug(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
