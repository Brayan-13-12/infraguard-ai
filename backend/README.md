# InfraGuard AI - Backend

FastAPI service for InfraGuard AI. v0.1 exposes health endpoints (liveness /
readiness / summary) and the wiring (config, DB sessions, Alembic) needed for
future development.

## Layout

```
app/
├── api/v1/          # versioned HTTP layer (routers + route modules)
├── core/            # centralized settings (config.py)
├── db/              # engine, session, declarative base
├── models/          # ORM models (empty in v0.1)
├── schemas/         # Pydantic request/response models
└── services/        # domain logic (health checks)
alembic/             # migration environment (uses app.core.config)
tests/               # pytest suite (no real database required)
requirements*.txt    # fully-resolved, hash-pinned locks (generated)
```

## Health endpoints

| Method | Path | Purpose | Codes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health/live` | Liveness - process is up. **Never** touches PostgreSQL. | `200` |
| `GET` | `/api/v1/health/ready` | Readiness - live `SELECT 1` against PostgreSQL. | `200` / `503` |
| `GET` | `/api/v1/health` | Summarized status (`healthy` / `degraded`). Kept for compatibility. | `200` / `503` |

The container `HEALTHCHECK` uses **liveness only**, so the backend is considered
healthy as soon as the process serves requests - independent of the database.

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
- `BACKEND_CORS_ORIGINS` contains a wildcard `*` or is empty.

Production secrets are expected as real environment variables. A later deployment
phase will source them from Kubernetes Secrets / an external secret manager;
v0.1 does not integrate one.

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
pytest
```

Tests override the DB dependency with an in-memory fake and force
`ENVIRONMENT=test`, so no database (and no production validation) is involved.

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

## Database migrations (Alembic)

`alembic/env.py` imports `app.core.config` and `app.db.base:Base`, so the URL and
metadata come from the one central place - credentials are never copied into
Alembic files.

```bash
alembic revision --autogenerate -m "add asset table"
alembic upgrade head
alembic downgrade -1
# in Docker: docker compose exec backend alembic upgrade head
```

No migrations exist in v0.1 - the domain model has not been introduced yet.
