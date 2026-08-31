# InfraGuard AI

**AI-powered infrastructure intelligence and incident management platform.**

InfraGuard AI aims to help operations teams understand their infrastructure,
model service dependencies, manage incidents, and get AI-assisted analysis of
impact and root cause.

> ## Current status: `v0.1` - Project Bootstrap
>
> This repository currently contains **only the foundation**: a monorepo, a
> running frontend, a running backend with real liveness/readiness probes, a
> containerised database, dependency locking, container hardening, and CI that
> builds and smoke-tests the stack. **No domain features** (assets, incidents,
> dashboards, AI, graphs, auth) are implemented yet - see [Roadmap](#roadmap).
> This is **not** production-ready.

---

## Project goals

- A clean, secure, reproducible base to build the platform on.
- Clear separation of frontend, backend and infrastructure concerns.
- Secure defaults; no secrets in the repo; least-privilege containers.
- Everything runs locally with a single command.
- Understandable to an engineer opening the repo for the first time.

## Architecture overview

```
Browser ──▶ frontend (Next.js) ──[edge net]──▶ backend (FastAPI) ──[data net]──▶ PostgreSQL
```

The frontend renders a dashboard and calls the backend **readiness** endpoint.
The backend performs a live `SELECT 1` against PostgreSQL and reports the result.
Nothing is hardcoded as healthy. Network segmentation means the frontend
container **cannot reach PostgreSQL** - only the backend bridges the two tiers.
Full detail (with Mermaid diagrams) is in
[`docs/architecture.md`](docs/architecture.md).

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 3, pnpm |
| Frontend tests | Vitest + Testing Library; ESLint 9 flat config |
| Backend | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, ruff |
| Backend deps | `pyproject.toml` + hash-pinned `requirements*.txt` (pip-tools) |
| Database | PostgreSQL 17 (Docker only) |
| Orchestration | Docker + Docker Compose (segmented networks, hardened containers) |
| CI | GitHub Actions - lint, tests, Docker build + smoke test (SHA-pinned actions) |

## Repository structure

```
infraguard-ai/
├── frontend/           Next.js app (src/app, components, lib, services, types) + vitest tests
├── backend/            FastAPI app (app/api, core, db, models, schemas, services) + alembic + pytest
│   └── requirements*.txt   hash-pinned dependency locks
├── infra/              Placeholder for future IaC (Kubernetes, Helm)
├── docs/               architecture.md
├── .github/workflows/  CI: lint + tests + Docker smoke test
├── docker-compose.yml  Full local stack (segmented networks, hardened)
├── .env.example        Environment template (placeholders only)
├── .gitignore  ·  LICENSE (MIT)  ·  README.md
```

## Prerequisites

- **Docker** + **Docker Compose v2** (the only requirement for the container flow)
- For running services directly on the host:
  - **Node.js** >= 20.9 and **pnpm** 11.24.0 (frontend)
  - **Python** 3.13 (backend)

PostgreSQL does **not** need to be installed on your machine.

## Environment configuration

```bash
cp .env.example .env      # at the repository root
```

`.env.example` contains **safe local-development placeholders only**. The backend
resolves `.env` by **absolute path** (repo root, then `backend/.env`), so
`cd backend && uvicorn ...` and running from the root behave identically.
Explicit environment variables always override `.env` values. `.env` is
git-ignored and is never copied into any image. The Compose file also has
non-secret fallback defaults, so it starts without a `.env` file.

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | `development` / `production` / `test` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Database credentials |
| `POSTGRES_HOST` / `POSTGRES_PORT` | Where the backend reaches the DB (`db` in Compose) |
| `DATABASE_URL` | Optional full SQLAlchemy URL; otherwise assembled from the parts |
| `BACKEND_CORS_ORIGINS` | Allowed CORS origins (local frontend only; no `*` in production) |
| `DB_HEALTHCHECK_TIMEOUT` | Readiness DB-check timeout in seconds (`0 < t <= 30`) |
| `NEXT_PUBLIC_API_URL` | Backend base URL as seen by the browser (no secrets) |

### Production configuration safety

With `ENVIRONMENT=production` the backend **refuses to start** if the database
password is a well-known placeholder/default or shorter than 12 characters, if
the DB user is a default (when assembling the URL from parts), or if
`BACKEND_CORS_ORIGINS` contains `*`. It fails fast with a clear server-side
error that contains no secrets. Production secrets are expected as real
environment variables; a later deployment phase will source them from Kubernetes
Secrets / an external secret manager (not part of v0.1).

## Docker (recommended)

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Backend liveness | http://localhost:8000/api/v1/health/live |
| Backend readiness | http://localhost:8000/api/v1/health/ready |

PostgreSQL publishes **no** host port and lives on an `internal` network with no
outbound route. Frontend/backend host ports bind to `127.0.0.1` only.

```bash
docker compose down        # keep data
docker compose down -v     # also delete the pgdata volume
```

## Local development (without Docker)

You still need PostgreSQL from Docker:

```bash
docker compose up db
```

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
python -m pip install --upgrade "pip==26.2.1"
pip install --require-hashes --no-deps -r requirements-dev.txt
pip install --no-deps -e .
POSTGRES_HOST=localhost uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
pnpm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
pnpm dev
```

## Available endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health/live` | Liveness. Always `200` while the process runs. No DB. |
| `GET` | `/api/v1/health/ready` | Readiness. `200` ready / `503` not ready (live DB check). |
| `GET` | `/api/v1/health` | Summarized status (`healthy` / `degraded`). Compatibility alias. |
| `GET` | `/docs` · `/openapi.json` | Swagger UI / OpenAPI schema |
| `GET` | `/` | Service metadata |

The `503` responses are documented in OpenAPI with the **same** schema as their
`200` counterparts.

## Testing

**Backend** (no database required - the DB dependency is faked, `ENVIRONMENT=test`):

```bash
cd backend
pip install --require-hashes --no-deps -r requirements-dev.txt && pip install --no-deps -e .
ruff check .
pytest
```

**Frontend** (Vitest + Testing Library; behavior-focused, no snapshots):

```bash
cd frontend
pnpm lint          # ESLint 9 flat config
pnpm typecheck
pnpm test          # vitest run
pnpm build
```

**CI** (`.github/workflows/ci.yml`) runs all of the above on every PR, then
builds the Compose stack and smoke-tests liveness, readiness and the frontend.

## Dependency & image reproducibility

- **Backend:** `pyproject.toml` holds abstract pins; `requirements.txt` /
  `requirements-dev.txt` are fully-resolved and **hash-pinned** (pip-tools).
  Docker installs `--require-hashes` from a local wheelhouse (no network at
  install time). Build tooling (`setuptools`, `wheel`, `pip`) is pinned.
  See [backend/README.md](backend/README.md#dependency-management) to update.
- **Frontend:** `pnpm-lock.yaml` + `packageManager: pnpm@11.24.0`.
- **Images:** base images are pinned by **digest** (readable tag kept in a
  comment). To update: `docker buildx imagetools inspect <image>:<tag>` and
  replace both the tag comment and the digest.
- **GitHub Actions:** pinned to commit SHAs with a version comment.

## Security notes

- No secrets in the repository; `.env` is git-ignored, `.env.example` holds placeholders.
- Production rejects placeholder DB credentials and wildcard CORS (fail-fast).
- CORS restricted to the local frontend origin - no wildcard.
- **Network segmentation:** frontend ⇄ backend on `edge`; backend ⇄ db on
  `data` (internal). The frontend cannot reach PostgreSQL.
- PostgreSQL has no published host port; app ports bind to `127.0.0.1`.
- Health/readiness responses never leak stack traces, connection strings or credentials.
- **Container hardening:** non-root users, `no-new-privileges`, all Linux
  capabilities dropped (db keeps only the 5 its entrypoint needs), read-only
  root filesystem for app containers with `tmpfs` for the few writable paths.
- Dependency locks with hash verification.
- **Not yet implemented (by design):** authentication, authorization, rate limiting.

## Roadmap

### Implemented now (v0.1)

- Monorepo layout with separated concerns
- Next.js dashboard showing live system health (calls backend readiness)
- FastAPI backend, versioned API (`/api/v1`), Swagger at `/docs`
- Liveness / readiness / summary health endpoints; real PostgreSQL check
- Centralised env-based configuration with production fail-safety
- SQLAlchemy engine/session + Alembic wired to the same config
- Hash-pinned backend dependency locks; digest-pinned base images
- Segmented, hardened Docker Compose stack
- Backend pytest suite + frontend Vitest suite
- CI: lint, tests, Docker build + smoke test (SHA-pinned actions, minimal permissions)

### Planned (future phases, not in v0.1)

- Authentication, authorization, users
- Infrastructure asset & service model, dependencies
- Incident management and impact analysis
- Infrastructure dependency graph (Neo4j)
- AI-assisted incident analysis (AI providers, RAG)
- Operational dashboards
- Kubernetes manifests + Helm chart (`infra/`), with Secrets / external secret manager
- CI/CD pipeline with security scanning and image publishing
- Observability stack (metrics, logs, traces)

## License

[MIT](LICENSE)
