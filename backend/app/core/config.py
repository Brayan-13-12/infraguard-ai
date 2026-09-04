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
        "change_this_in_production",
        "dev-insecure-jwt-secret-change-me",
        "postgres",
        "password",
        "secret",
        "admin",
        "root",
        "infraguard",
        "jwt-secret",
        "your-secret-key",
    }
)
_MIN_PROD_PASSWORD_LEN = 12
_MIN_JWT_SECRET_LEN = 32


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

    # --- Authentication (v0.2) ---
    # HS256 signing secret. The default is an obvious placeholder and is rejected
    # when ENVIRONMENT=production (see _enforce_production_safety).
    JWT_SECRET: str = "dev-insecure-jwt-secret-change-me"
    JWT_ALGORITHM: Literal["HS256"] = "HS256"
    # Interactive session lifetime. The single source of truth for both the JWT
    # `exp` claim and the auth cookie `Max-Age` (see `access_token_expires_seconds`
    # and `app/core/security.py`). There is no server-side revocation, so this is
    # also the maximum validity window of a leaked token - see docs/architecture.md
    # §12.14. 30 min balances "stay signed in" against that exposure.
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, gt=0, le=1440)
    JWT_ISSUER: str = "infraguard-api"

    # Cookie that carries the access token (HttpOnly; never readable by JS).
    AUTH_COOKIE_NAME: str = "infraguard_access"
    # `Secure` flag. None -> derived from ENVIRONMENT (secure everywhere except dev).
    AUTH_COOKIE_SECURE: bool | None = None
    AUTH_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    # Password policy. Argon2 handles arbitrary length; the max only bounds the
    # work an attacker can force per request. Passwords are never truncated.
    PASSWORD_MIN_LENGTH: int = Field(default=12, ge=8, le=64)
    PASSWORD_MAX_LENGTH: int = Field(default=128, ge=64, le=1024)

    # Best-effort in-process rate limiting for auth endpoints (no external store).
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: int = Field(default=10, gt=0)
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, gt=0)

    # --- AI Assistant (read-only intelligence - v1) ---
    # ``deterministic`` needs no external service and is the default for local
    # development, tests and CI. ``openai`` activates the optional real adapter
    # (backend-only; requires AI_API_KEY). If a real provider is selected but no
    # key is configured the assistant degrades gracefully to a clear message -
    # InfraGuard stays fully usable.
    AI_PROVIDER: Literal["deterministic", "openai"] = "deterministic"
    AI_MODEL: str = "infraguard-deterministic-v1"
    AI_API_KEY: str | None = None
    AI_OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    #: Hard ceiling on a single provider call (seconds).
    AI_REQUEST_TIMEOUT_SECONDS: float = Field(default=30.0, gt=0, le=120)
    #: Max length of a single user message (enforced backend + frontend).
    AI_MESSAGE_MAX_LENGTH: int = Field(default=4000, gt=0, le=20000)
    #: Rows any single AI tool may return (grounding stays bounded / minimal).
    AI_MAX_TOOL_RESULTS: int = Field(default=25, gt=0, le=100)
    #: Recent messages replayed to the provider for continuity.
    AI_HISTORY_WINDOW: int = Field(default=10, gt=0, le=50)
    #: Per-user message rate limit (stricter than ordinary reads).
    AI_RATE_LIMIT_MAX_MESSAGES: int = Field(default=20, gt=0)
    AI_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, gt=0)

    # --- Neo4j graph projection (Asset Relationships & Topology milestone) ---
    # PostgreSQL (``asset_relationships``) is the canonical source of truth;
    # Neo4j is a DERIVED projection used for graph sync/health and future
    # graph-native querying - the v1 topology API itself is answered entirely
    # from PostgreSQL (see app/services/topology.py) and never blocks on Neo4j.
    # Leaving NEO4J_URI unset means "not configured": sync becomes a no-op and
    # the rest of InfraGuard is completely unaffected.
    NEO4J_URI: str | None = None
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: str | None = None
    NEO4J_DATABASE: str = "neo4j"
    #: Hard ceiling on a single Neo4j driver call (seconds).
    NEO4J_TIMEOUT_SECONDS: float = Field(default=5.0, gt=0, le=60)

    # --- Bootstrap Administrator (Governance Phase 3) ---
    # Credentials for the explicit `python -m app.scripts.bootstrap_admin` command
    # (and the `bootstrap` compose one-shot). Used ONLY by that command - never on
    # startup, never in a request path. The command creates the account only if
    # absent, marks it `active`, grants Administrator, and NEVER resets an
    # existing password. Leave unset to disable the command.
    BOOTSTRAP_ADMIN_EMAIL: str | None = None
    BOOTSTRAP_ADMIN_PASSWORD: str | None = None

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

        secret = self.JWT_SECRET.strip()
        if secret.lower() in _PLACEHOLDER_SECRETS:
            problems.append("JWT_SECRET is a well-known placeholder/default value")
        elif len(secret) < _MIN_JWT_SECRET_LEN:
            problems.append(
                f"JWT_SECRET must be at least {_MIN_JWT_SECRET_LEN} characters"
            )

        if self.AUTH_COOKIE_SECURE is False:
            problems.append("AUTH_COOKIE_SECURE must not be disabled in production")
        if self.AUTH_COOKIE_SAMESITE == "none" and not self.auth_cookie_secure:
            problems.append("SameSite=None cookies require Secure=true")

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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def auth_cookie_secure(self) -> bool:
        """Effective Secure flag: explicit override, else on only in production."""
        if self.AUTH_COOKIE_SECURE is not None:
            return self.AUTH_COOKIE_SECURE
        return self.ENVIRONMENT == "production"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def access_token_expires_seconds(self) -> int:
        return self.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
