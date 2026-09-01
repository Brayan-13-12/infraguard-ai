# InfraGuard AI

**AI-powered infrastructure intelligence and incident management platform.**

InfraGuard AI aims to help operations teams understand their infrastructure,
model service dependencies, manage incidents, and get AI-assisted analysis of
impact and root cause.

> ## Current status: `v0.2` - Authentication & Identity
>
> Builds on the v0.1 bootstrap (monorepo, liveness/readiness, segmented +
> hardened Docker, dependency locking, CI). **v0.2 adds the first persistent
> entity (`User`)** and email + password authentication: register, log in
> (Argon2id + short-lived JWT in an HttpOnly cookie), `GET /auth/me`, log out,
> and a client-guarded `/dashboard`. **No further domain** (assets, incidents,
> dashboards, AI, graphs) and **no RBAC / OAuth / MFA / refresh tokens / password
> reset / email verification** - see [Roadmap](#roadmap). This is **not**
> production-ready.

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

The frontend renders a dashboard, calls the backend **readiness** endpoint, and
(v0.2) authenticates against `/api/v1/auth/*`. The access token is an **HS256
JWT** carried in an **HttpOnly cookie** - never in `localStorage`, never
readable by JS. Passwords are hashed with **Argon2id**. Network segmentation
means the frontend container **cannot reach PostgreSQL** - only the backend
bridges the two tiers. Full detail (with Mermaid diagrams) is in
[`docs/architecture.md`](docs/architecture.md).

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 3, pnpm |
| Theming | `next-themes` (light / dark / system, persisted, no-flash); semantic CSS-variable tokens; internal Tailwind component set |
| Frontend tests | Vitest + Testing Library; ESLint 9 flat config |
| Backend | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, ruff |
| Auth | Argon2id (`argon2-cffi`), JWT HS256 (`pyjwt`), HttpOnly cookie |
| Backend deps | `pyproject.toml` + hash-pinned `requirements*.txt` (pip-tools) |
| Database | PostgreSQL 17 (Docker only) - `users` table via Alembic |
| Orchestration | Docker + Docker Compose (segmented networks, hardened containers) |
| CI | GitHub Actions - lint, unit + integration tests, Docker build + migrate + auth smoke test (SHA-pinned actions) |

## Repository structure

```
infraguard-ai/
├── frontend/           Next.js app  (see frontend/README.md for the UI foundation)
│   └── src/            app/{login,register,dashboard,healthz} · components/{ui,theme,shell,auth,
│                       dashboard} · services/{auth,health} · lib · types
├── backend/            FastAPI app
│   ├── app/            api/{deps,errors,v1/routes} · core/{config,security,ratelimit}
│   │                   · db · models/user · schemas · services
│   ├── alembic/versions/   02c49f7b5787_create_users_table.py
│   ├── tests/{unit,integration}/
│   └── requirements*.txt   hash-pinned dependency locks
├── infra/              Placeholder for future IaC (Kubernetes, Helm)
├── docs/               architecture.md
├── .github/workflows/  CI: lint + unit/integration tests + Docker migrate + auth smoke test
├── docker-compose.yml  Full local stack (segmented networks, hardened) + one-shot `migrate`
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
| `JWT_SECRET` | HS256 signing secret (`>= 32` chars in production; never a `NEXT_PUBLIC_*`) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime (default 15) |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | Auth cookie flags (`Secure` derived from env if unset) |

### Production configuration safety

With `ENVIRONMENT=production` the backend **refuses to start** (clear server-side
error, no secrets in the message) if: the database password is a placeholder /
`< 12` chars, the DB user is a default, `BACKEND_CORS_ORIGINS` contains `*`,
**`JWT_SECRET` is a placeholder / `< 32` chars**, or **`AUTH_COOKIE_SECURE` is
disabled**. Production secrets are expected as real environment variables; a
later deployment phase will source them from Kubernetes Secrets / an external
secret manager.

## Docker (recommended)

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

```bash
docker compose run --rm migrate   # apply DB migrations (creates the users table)
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 · `/login` · `/register` · `/dashboard` |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Backend liveness | http://localhost:8000/api/v1/health/live |
| Backend readiness | http://localhost:8000/api/v1/health/ready |

The `migrate` service is **one-shot** and never runs on `docker compose up`.
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
| `POST` | `/api/v1/auth/register` | `{email, password}` → `201` user · `409` duplicate · `422` policy · `429` |
| `POST` | `/api/v1/auth/login` | `{email, password}` → `200` user + sets HttpOnly cookie · `401` · `429` |
| `POST` | `/api/v1/auth/logout` | Clears the auth cookie → `200` |
| `GET` | `/api/v1/auth/me` | Authenticated user's public profile → `200` · `401` · `403` |
| `GET` | `/docs` · `/openapi.json` | Swagger UI / OpenAPI schema |
| `GET` | `/` | Service metadata |

The `503` responses are documented in OpenAPI with the **same** schema as their
`200` counterparts. Login failures are **generic** (`Invalid email or password`)
for wrong password, unknown user and inactive account alike.

## Testing

**Backend** - unit tests need no database; integration tests use a real one:

```bash
cd backend
pip install --require-hashes --no-deps -r requirements-dev.txt && pip install --no-deps -e .
ruff check .
pytest                                    # fast unit tests only
TEST_DATABASE_URL=postgresql+psycopg://u:p@localhost:5432/infraguard_test pytest -m ""
```

Integration tests **skip** (not fail) when `TEST_DATABASE_URL` is unset.

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
- Production rejects placeholder DB credentials, wildcard CORS, and placeholder /
  short `JWT_SECRET` (fail-fast, no secrets in the error).
- **Passwords:** Argon2id, never stored in clear, never logged, never returned.
  **Validation errors (`422`) never echo the submitted value** - the custom
  handler returns only `{type, loc, msg}` (Pydantic's raw `input`/`ctx` stripped).
- **Tokens:** short-lived HS256 JWT in an **HttpOnly, SameSite=Lax, Secure-in-prod
  cookie** - not in `localStorage`, not readable by JS. No secret reaches the
  frontend. The **only** value the frontend persists client-side is the theme
  preference (`localStorage` key `theme`) - non-sensitive by design.
- **CSRF:** SameSite=Lax + strict `Origin`/`Referer` check on state-changing
  methods + credentialed-but-non-wildcard CORS.
- **Caching:** all `/api/v1/auth/*` responses are `Cache-Control: no-store`.
- **Login:** generic failure message (no user enumeration); a dummy Argon2 verify
  runs for unknown users to equalise timing. Best-effort per-IP rate limiting on
  `login` / `register` (in-process; production needs a shared store).
- **Registration** returns an explicit `409` for a known email - an
  **accepted v0.2 usability tradeoff** (enumeration). Documented; not redesigned.
- **Logout** clears the session on the client **only after a confirmed `200`** -
  a failed request leaves you signed in with a clear message.
- **Network segmentation:** frontend ⇄ backend on `edge`; backend ⇄ db on
  `data` (internal). The frontend cannot reach PostgreSQL.
- PostgreSQL has no published host port; app ports bind to `127.0.0.1`.
- Errors never leak stack traces, SQL, connection strings or credentials
  (DB-unavailable → generic `503`).
- **Container hardening (unchanged):** non-root users, `no-new-privileges`,
  `cap_drop: ALL`, read-only root FS for app containers + `tmpfs`.
- **Not implemented (by design):** RBAC / roles, OAuth, MFA, refresh-token
  rotation, server-side JWT revocation, password reset, email verification.

### Logout semantics

`POST /api/v1/auth/logout` clears the cookie. It does **not** revoke the JWT -
without a `jti` denylist a stolen token stays valid until it expires (≤ 15 min).
Revocation is a documented next step.

## Roadmap

### Implemented now

**v0.1 - Bootstrap**

- Monorepo, Next.js health dashboard, FastAPI `/api/v1`, Swagger
- Liveness / readiness / summary health endpoints; real PostgreSQL check
- Centralised env config with production fail-safety
- Hash-pinned backend deps; digest-pinned images; segmented + hardened Compose
- Backend pytest + frontend Vitest; SHA-pinned CI

**v0.2 - Authentication & Identity**

- `User` model (UUID, unique lowercased email, `is_active`, tz-aware timestamps)
  + first Alembic migration (`users`), validated upgrade/downgrade
- `register` / `login` / `logout` / `me`; Argon2id hashing; HS256 JWT
- HttpOnly cookie token storage; SameSite + Origin-check CSRF defense
- Reusable `get_current_user` dependency for future protected endpoints
- Best-effort in-process rate limiting on auth endpoints
- Frontend `/login` `/register` `/dashboard` with a client-side route guard and
  an `AuthProvider` context
- Backend unit + integration test split; CI runs both + a Docker auth smoke test

**v0.3 - UI Foundation, Theming & i18n**

- Light / dark theme (`next-themes`, persisted, no-flash) exposed as a single
  contextual sun/moon toggle - "system" is still the first-visit default
  internally but is never shown in the UI
- Lightweight custom internationalisation (`src/i18n/`, no dependency):
  **Spanish default** + English, `LanguageProvider` / `useTranslation()`,
  persisted `ES | EN` switcher. Descriptive copy translates; product/module
  proper nouns (`InfraGuard AI`, the sidebar nav labels, the `Dashboard`
  heading, `Coming soon`) stay English in every locale
- Semantic CSS-variable design tokens + a small internal Tailwind component set
  (Button, Input, Card, Badge, Alert, PageHeader, Spinner, EmptyState, Reveal)
- Single self-contained centered authentication card (brand + language + theme
  live inside the card - nothing floats in the corners) on a restrained backdrop
- Authenticated app shell: desktop sidebar carries navigation **plus** language,
  theme, the signed-in identity and a confirmation-gated sign-out; the topbar is
  mobile-only; the same controls live in the mobile drawer. Assets / Incidents /
  AI Assistant / Settings shown as disabled "Coming soon"
- Dashboard (account summary, platform modules, system health) with a reusable
  entrance-motion system - no invented domain data
- Responsive 360-1440px, `prefers-reduced-motion` respected, keyboard-accessible
  navigation, language and theme controls

### Planned (future phases)

- Authorization / RBAC / roles; refresh-token rotation; JWT revocation; password
  reset; email verification; OAuth; MFA
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
