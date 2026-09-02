# InfraGuard AI - Backend

FastAPI service for InfraGuard AI.

* **v0.1** - health endpoints (liveness / readiness / summary) + wiring.
* **v0.2** - authentication & identity: the first persistent entity (`User`),
  registration / login / logout / `me`, Argon2id password hashing, JWT access
  tokens delivered as an HttpOnly cookie, the first Alembic migration.
* **Assets** - infrastructure inventory: the `Asset` entity, authenticated
  `/api/v1/assets` CRUD with pagination / search / filters and soft
  deactivate / reactivate, second Alembic migration.

## Layout

```
app/
├── api/
│   ├── deps.py      # get_current_user, CSRF origin check, rate limiter
│   ├── errors.py    # sanitized 422 validation handler + generic 503 for DB-unavailable
│   └── v1/routes/   # health.py, auth.py, assets.py
├── core/            # config.py, security.py (Argon2 + JWT), ratelimit.py
├── db/              # engine, session, declarative base, registry
├── models/          # user.py, asset.py (+ catalog StrEnums)
├── schemas/         # health.py, auth.py, asset.py
├── main.py          # app factory + no-store middleware for /api/v1/auth/*
└── services/        # health.py, users.py, assets.py
alembic/versions/    # *_create_users_table.py, *_create_assets_table.py
tests/
├── dbguard.py       # test-only database safety guard (shared)
├── unit/            # fast, no database
└── integration/     # real PostgreSQL; skip if TEST_DATABASE_URL unset, FAIL if set & bad
requirements*.txt    # fully-resolved, hash-pinned locks (generated)
```

## Endpoints

| Method | Path | Purpose | Codes |
| --- | --- | --- | --- |
| `GET`  | `/api/v1/health/live`  | Liveness - process is up. **Never** touches PostgreSQL. | `200` |
| `GET`  | `/api/v1/health/ready` | Readiness - live `SELECT 1` against PostgreSQL. | `200` / `503` |
| `GET`  | `/api/v1/health`       | Summarized status (`healthy` / `degraded`). Compatibility alias. | `200` / `503` |
| `POST` | `/api/v1/auth/register`| Create an account. | `201` / `409` / `422` / `429` |
| `POST` | `/api/v1/auth/login`   | Authenticate; sets the `infraguard_access` HttpOnly cookie. | `200` / `401` / `429` |
| `POST` | `/api/v1/auth/logout`  | Clear the auth cookie. | `200` |
| `GET`  | `/api/v1/auth/me`      | The authenticated user's public profile. | `200` / `401` / `403` |
| `GET`  | `/api/v1/assets`       | List assets (paginated, `q` search, catalog + `is_active` filters; `criticality` / `status` are repeatable → `IN (...)`). **Auth.** | `200` / `401` / `422` |
| `GET`  | `/api/v1/assets/summary` | Aggregate counts (`total` / `active` / `inactive` + `by_criticality` / `by_status` / `by_environment` / `by_type`). Read-only. **Auth.** | `200` / `401` / `503` |
| `POST` | `/api/v1/assets`       | Create an asset. **Auth + CSRF.** | `201` / `401` / `403` / `422` |
| `GET`  | `/api/v1/assets/{id}`  | Asset detail. **Auth.** | `200` / `401` / `404` |
| `PATCH`| `/api/v1/assets/{id}`  | Partial content update (no `is_active`). **Auth + CSRF.** | `200` / `401` / `403` / `404` / `422` |
| `POST` | `/api/v1/assets/{id}/deactivate` \| `/reactivate` | Soft lifecycle toggle (idempotent). **Auth + CSRF.** | `200` / `401` / `403` / `404` |

The container `HEALTHCHECK` uses **liveness only**, so the backend is considered
healthy as soon as the process serves requests - independent of the database.

## Assets (infrastructure inventory)

`app/models/asset.py` - `id` (UUID PK), `name` + `asset_type` / `environment` /
`criticality` / `status` (required, each a `varchar` + DB `CHECK` built from a
Python `StrEnum` catalog), optional `hostname` / `ip_address` / `description` /
`owner`, `is_active`, tz-aware `created_at` / `updated_at`. Indexes on `name`,
every filter column and `created_at`. **No UNIQUE constraint** - the same name
recurs legitimately across environments.

- **Catalog:** `StrEnum` + `CHECK`, not catalog tables (overhead for a fixed
  vocabulary) and not a native PG `ENUM` (needs a migration to extend). Values
  are stored in English; the frontend translates them for display.
- **Validation** (`app/schemas/asset.py`): `AssetCreate` / `AssetUpdate` set
  `extra="forbid"`; `ip_address` is parsed with `ipaddress` and stored
  normalised; optional strings are trimmed, blank → `NULL`.
- **List** (`app/services/assets.py`): pagination metadata
  (`items/page/page_size/total/total_pages`), `page_size` capped at 100, ordering
  `updated_at DESC, id DESC`. Search is an **escaped** `ILIKE '%term%'` over
  `name` / `hostname` / `owner` / `ip_address`, built with the SQLAlchemy
  expression API - never string-concatenated SQL. `criticality` / `status`
  accept repeated query values (`AssetQuery` holds tuples → `col.in_(...)`); a
  single value is unchanged, so existing URLs keep working.
- **Summary** (`get_asset_summary`): a handful of `GROUP BY` / `count(*) FILTER`
  queries (not dozens of list calls); `AssetSummary` fills every catalog key,
  reporting `0` for absent values. Read-only - no model or schema migration.
  DB errors are sanitised to a generic `503` by the global handlers.
- **Deactivation - decision:** no `DELETE`. Lifecycle is the dedicated
  `POST /{id}/deactivate` + `/reactivate` pair (idempotent, explicit,
  auditable); `PATCH` stays content-only. A deactivated asset is still
  queryable with `is_active=false`.
- **Known limits:** no trigram search index, no per-asset authorization (any
  authenticated user edits any asset - RBAC is a later phase), no bulk ops /
  import / export, last-write-wins on `PATCH`.

## Authentication

### User model

`app/models/user.py` - `id` (UUID PK, DB-generated), `email` (unique,
lowercased + non-empty via CHECK constraints), `password_hash`, `is_active`,
`created_at` / `updated_at` (timezone-aware). No roles, permissions or
organizations - authorization is a later phase.

### Password hashing

Argon2id via `argon2-cffi` with the library's **recommended default
parameters** (we do not hand-pick cryptographic settings). `check_needs_rehash`
transparently upgrades stored hashes on the next successful login. Passwords are
never stored in clear, never logged, and never returned. Policy: **12-128
characters**, blank rejected, nothing truncated - passphrases and password
managers are encouraged.

### JWT access tokens

`app/core/security.py`. HS256, secret from `JWT_SECRET` (config). Claims:
`sub` (user id), `iat`, `nbf`, `exp`, `jti`, `iss`, `type=access` - **no**
email or password material. Short-lived (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`,
default 15). Validation enforces signature, issuer, expiry and the required
claims; malformed / expired / wrong-type / `alg=none` tokens are rejected.

**No refresh tokens and no server-side revocation in v0.2.** Clearing the cookie
on logout does not invalidate an already-issued token - it stays valid until it
expires. A `jti` denylist (or short-lived access + refresh rotation) is the
next hardening step. `JWT_SECRET` rotation / a KMS-managed key is a
deployment-phase concern.

### Token storage - cookie, not localStorage

The access token is delivered as a cookie: `HttpOnly` (invisible to JS -
mitigates token theft via XSS), `SameSite=Lax`, `Secure` in production,
`Path=/`, `Max-Age` = token lifetime. The backend also accepts
`Authorization: Bearer <token>` for non-browser API clients and tests.

### CSRF

`SameSite=Lax` + a strict `Origin`/`Referer` check on state-changing methods
(`app/api/deps.py:require_trusted_origin`) + the credentialed-but-non-wildcard
CORS policy. Requests without `Origin`/`Referer` (non-browser clients) are
allowed; browser requests from a disallowed origin get `403`.

### Validation errors & caching

* `app/api/errors.py` installs a custom `RequestValidationError` handler that
  returns only `{type, loc, msg}` per error. Pydantic's default body includes
  `input` (the raw submitted value - a **plaintext password** for the password
  field) and `ctx`; both are stripped. The frontend's per-field messages still
  work off `detail[].loc` / `detail[].msg`.
* A path-scoped middleware sets `Cache-Control: no-store` + `Pragma: no-cache`
  on every `/api/v1/auth/*` response, including error responses.

### Duplicate registration (accepted tradeoff)

`register` returns an explicit `409 "Email is already registered"`, which allows
account enumeration. Kept deliberately for portfolio usability; rate limiting
blunts bulk probing. Production would use a generic response + out-of-band email
confirmation. See `docs/architecture.md` §12.14.

### Rate limiting

Best-effort in-process fixed-window limiter (`app/core/ratelimit.py`) on
`login` and `register` - `AUTH_RATE_LIMIT_MAX_ATTEMPTS` per
`AUTH_RATE_LIMIT_WINDOW_SECONDS` per client IP. **Per-process and lost on
restart** - production needs a shared store (Redis) or gateway/WAF rate
limiting. No Redis is added for v0.2.

## Migration workflow

```bash
# Local (host), against a running PostgreSQL:
export DATABASE_URL=postgresql+psycopg://infraguard:...@localhost:5432/infraguard
alembic upgrade head           # apply
alembic downgrade -1           # roll back one
alembic revision --autogenerate -m "add <table>"   # after model changes

# Docker (one-shot, never runs on `up`):
docker compose run --rm migrate
```

`alembic/env.py` imports `app.db.registry` (which imports every model) so
autogenerate sees the full metadata. The DB URL comes from `app.core.config` -
never duplicated into Alembic files. Two migrations so far: `users` then
`assets` (chained via `down_revision`). Both were hand-reviewed and validated on
the Docker PostgreSQL (`upgrade → downgrade -1 → upgrade`, plus `alembic check`
shows no model/DB drift).

## Configuration & `.env` resolution

`app/core/config.py` holds one `Settings` object. The `.env` file is resolved by
**absolute path** - the repository root first, then `backend/.env` - so
`cd backend && uvicorn ...` and running from the repo root behave identically.
Explicit environment variables always win over `.env` values.

### Production fail-safety

With `ENVIRONMENT=production` the settings object refuses to build (clear
server-side `ConfigurationError`, no secrets in the message) when:

- the DB password is a well-known placeholder/default, or shorter than 12 chars;
- the DB user is a placeholder/default (when the URL is assembled from parts);
- `BACKEND_CORS_ORIGINS` contains a wildcard `*` or is empty;
- **(v0.2)** `JWT_SECRET` is a placeholder/default or shorter than 32 chars;
- **(v0.2)** `AUTH_COOKIE_SECURE` is explicitly `false`, or `SameSite=None`
  without `Secure`.

Production secrets are expected as real environment variables. A later deployment
phase will source them from Kubernetes Secrets / an external secret manager;
neither v0.1 nor v0.2 integrates one.

New v0.2 keys (see `.env.example`): `JWT_SECRET`,
`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`,
`AUTH_RATE_LIMIT_MAX_ATTEMPTS`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`,
`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`.

## Local development (without Docker)

Requires Python 3.13.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1

# Reproducible install from the hash-pinned lock:
python -m pip install --upgrade "pip==26.2.1"
pip install --require-hashes --no-deps -r requirements-dev.txt
pip install --no-deps -e .

# Point at a running PostgreSQL (e.g. `docker compose up db`):
export POSTGRES_HOST=localhost
uvicorn app.main:app --reload
```

- API: http://localhost:8000  ·  Docs: http://localhost:8000/docs
- Liveness: http://localhost:8000/api/v1/health/live
- Readiness: http://localhost:8000/api/v1/health/ready

## Tests

```bash
pip install --require-hashes --no-deps -r requirements-dev.txt && pip install --no-deps -e .

# Disposable test database (name MUST be 'test' or end with '_test'):
docker run -d --rm -e POSTGRES_DB=infraguard_test -e POSTGRES_USER=t \
  -e POSTGRES_PASSWORD=t -p 127.0.0.1:55432:5432 postgres:17.2-alpine
export TEST_DATABASE_URL=postgresql+psycopg://t:t@localhost:55432/infraguard_test

pytest                       # fast unit tests only (default)
pytest -m ""                 # unit + integration (real PostgreSQL)
pytest -m integration        # integration only
```

* **Unit** (`tests/unit/`) - no database, `ENVIRONMENT=test`, deterministic:
  config fail-safety, Argon2 + JWT, password policy / schema serialization,
  the rate limiter, health-endpoint behaviour, **the 422 no-reflection guard**,
  **the no-store header rule**, **the test-DB safety guard**, the **asset
  schema validation** (enums / IP / limits / `extra="forbid"`), and that **every
  asset endpoint rejects an unauthenticated request** before touching the DB.
* **Integration** (`tests/integration/`) - each test runs in a transaction that
  is rolled back; exercises the full register / login / `me` / logout API and
  the full asset lifecycle (create / list / paginate / search / filter / detail /
  update / deactivate / reactivate / 401 / 404 / invalid enum / invalid IP /
  DB-error → generic `503`). An `auth_client` fixture provides a logged-in client.

### Integration test database safety (`tests/dbguard.py`)

* **`TEST_DATABASE_URL` unset** → integration tests **skip**.
* **`TEST_DATABASE_URL` set** → it must pass the guard *and* be reachable, or the
  suite **fails** (never silently skips - important in CI):
  * the database **name must be `test` or end with `_test`** (case-insensitive);
  * it must not equal the application's own `DATABASE_URL` database.
* Only then does the fixture run `drop_all` / `create_all`. This makes it
  impossible to point the destructive fixture at a real database by mistake.

## Dependency management

Two layers:

1. **`pyproject.toml`** - the abstract, human-edited top-level dependencies
   (each pinned with `==`). Build tooling (`setuptools`, `wheel`) is pinned in
   `[build-system]`.
2. **`requirements.txt` / `requirements-dev.txt`** - fully-resolved, including
   every transitive dependency, with `--generate-hashes`. These are committed
   and are what Docker and CI install (`pip install --require-hashes`).

### Update the lock

```bash
pip install --no-deps -e ".[dev]"          # get pip-tools
pip-compile --generate-hashes --strip-extras \
  --output-file=requirements.txt pyproject.toml
pip-compile --generate-hashes --strip-extras --extra=dev \
  --output-file=requirements-dev.txt pyproject.toml
```

Commit the regenerated `requirements*.txt` alongside the `pyproject.toml` change.

### Reproduce the environment

`pip install --require-hashes --no-deps -r requirements-dev.txt` (dev) or
`-r requirements.txt` (runtime only). The Docker image builds a wheelhouse from
`requirements.txt` and installs `--no-index` from it - no network, no build step.

**v0.2 additions:** `pyjwt`, `argon2-cffi`, `email-validator` (and their
transitive deps `cffi`, `pycparser`, `argon2-cffi-bindings`, `dnspython`).
