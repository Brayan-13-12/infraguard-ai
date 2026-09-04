# InfraGuard AI

**AI-powered infrastructure intelligence and incident management platform.**

InfraGuard AI aims to help operations teams understand their infrastructure,
model service dependencies, manage incidents, and get AI-assisted analysis of
impact and root cause.

> ## Current status: Product Experience
>
> Builds on the bootstrap (v0.1), authentication (v0.2), the UI foundation (v0.3)
> and the asset inventory. This milestone is the first **product-experience**
> pass: an "infrastructure operations console" visual direction, **dark as the
> default theme**, a **Spanish-only** visible UI (the i18n layer stays; the
> switcher is gone), a **grouped sidebar**, reusable **overlay** (dialog / drawer
> / confirm), **toast** and **skeleton** foundations, and a **real operational
> Dashboard**: KPI counts and charts sourced from a new aggregation endpoint
> `GET /api/v1/assets/summary`, with drill-down into the filtered Assets list.
> `status` and `criticality` list filters now accept repeated values.
>
> **Still out of scope** (later phases): Kubernetes, obsolescence tracking,
> and (from v0.2) OAuth / MFA / refresh tokens / password reset / email
> verification / server-side JWT revocation. See [Roadmap](#roadmap). This is
> **not** production-ready.
>
> This banner predates several shipped milestones (Incidents, Audit, Trash,
> RBAC, AI Assistant, Asset Relationships & Topology) - see
> [Roadmap → Implemented now](#implemented-now) for the current, maintained
> feature list.

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
                                                                    └─[data net]──▶ Neo4j (derived)
```

The frontend renders a dashboard, calls the backend **readiness** endpoint, and
(v0.2) authenticates against `/api/v1/auth/*`. The access token is an **HS256
JWT** carried in an **HttpOnly cookie** - never in `localStorage`, never
readable by JS. Passwords are hashed with **Argon2id**. Network segmentation
means the frontend container **cannot reach PostgreSQL or Neo4j** - only the
backend bridges the two tiers. **PostgreSQL is canonical for everything,
including asset relationships**; **Neo4j is a backend-only, optional, derived
graph projection** used for the topology query path and future graph-native
features - the frontend never holds Neo4j credentials, sends Cypher, or
depends on a Neo4j driver. Full detail (with Mermaid diagrams) is in
[`docs/architecture.md`](docs/architecture.md).

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 3, pnpm |
| Theming | `next-themes` (**dark default**, light fully supported, persisted, no-flash); semantic CSS-variable tokens only (no `dark:` variants); internal Tailwind component set + overlay / toast / skeleton primitives |
| Charts | Recharts (only on the Dashboard, lazy-loaded via `next/dynamic`, wrapped behind InfraGuard components with an accessible companion table) |
| i18n | Spanish-only visible UI; typed keys, `es.ts` source of truth, `en.ts` structurally validated; no language switcher, no persisted language |
| Frontend tests | Vitest + Testing Library; ESLint 9 flat config |
| Graph visualization | `@xyflow/react` (React Flow) + `@dagrejs/dagre` for layout - the **only** graph library, isolated to the `/topology` route chunk |
| Backend | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, ruff |
| Auth | Argon2id (`argon2-cffi`), JWT HS256 (`pyjwt`), HttpOnly cookie |
| Backend deps | `pyproject.toml` + hash-pinned `requirements*.txt` (pip-tools) |
| Database | PostgreSQL 17 (Docker only) - canonical store for every table, including `asset_relationships` |
| Graph projection | Neo4j 5.26 Community (Docker, optional) - a **derived**, backend-only projection of canonical asset relationships; official `neo4j` Python driver |
| Orchestration | Docker + Docker Compose (segmented networks, hardened containers) |
| CI | GitHub Actions - lint, unit + integration tests, Docker build + migrate + auth/relationships/topology smoke tests, ephemeral Neo4j (SHA-pinned actions) |

## Repository structure

```
infraguard-ai/
├── frontend/           Next.js app  (see frontend/README.md)
│   └── src/            app/{login,register,dashboard,assets,incidents,audit,trash,
│                       admin,ai,topology,healthz} ·
│                       components/{ui,theme,shell,auth,dashboard,assets,incidents,
│                       audit,trash,admin,ai,topology} ·
│                       services/{auth,health,assets,incidents,audit,trash,admin,ai,
│                       relationships,topology} · i18n · lib · types
├── backend/            FastAPI app
│   ├── app/            api/{deps,errors,v1/routes} · core/{config,security,ratelimit,db_safety}
│   │                   · db · models · schemas · services/{…,graph} · seeds · scripts
│   ├── alembic/versions/   *_create_users_table.py · … · *_add_asset_relationships.py
│   ├── tests/{unit,integration}/
│   └── requirements*.txt   hash-pinned dependency locks
├── infra/              Placeholder for future IaC (Kubernetes, Helm)
├── docs/               architecture.md
├── .github/workflows/  CI: lint + unit/integration tests + Docker migrate/bootstrap/seed +
│                       relationships/topology + Neo4j-outage smoke tests
├── docker-compose.yml  Full local stack (segmented networks, hardened) + one-shot
│                       migrate / bootstrap / seed-demo / sync-topology + throwaway db-test
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
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Interactive session lifetime (default **30**). Drives both the JWT `exp` and the cookie `Max-Age`. |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | Auth cookie flags (`Secure` derived from env if unset) |
| `AI_PROVIDER` | `deterministic` (default, no key, real DB) or `openai` |
| `AI_MODEL` | Model id passed to the provider (default `infraguard-deterministic-v1`) |
| `AI_API_KEY` | Provider API key - **backend only**, never a `NEXT_PUBLIC_*`. Unset ⇒ a real provider reports "not ready" and the Assistant degrades gracefully |
| `AI_OPENAI_BASE_URL` | OpenAI-compatible base URL (default `https://api.openai.com/v1`) |
| `AI_REQUEST_TIMEOUT_SECONDS` | Provider call timeout (`0 < t <= 120`, default 30) |
| `AI_MESSAGE_MAX_LENGTH` | Max user-message length (default 4000) |
| `AI_MAX_TOOL_RESULTS` / `AI_HISTORY_WINDOW` | Bounded tool result rows / replayed history turns |
| `AI_RATE_LIMIT_MAX_MESSAGES` / `AI_RATE_LIMIT_WINDOW_SECONDS` | Per-user AI message limiter (default 20 / 60 s) |
| `NEO4J_URI` | Bolt URI for the **optional** graph projection (default `bolt://neo4j:7687` in Compose). **Unset it (or stop/remove the `neo4j` service) and every other InfraGuard feature - including relationship CRUD and the topology API - keeps working unchanged** (bounded PostgreSQL traversal) |
| `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` | Neo4j credentials - **backend only**, never a `NEXT_PUBLIC_*`, never sent to the browser |
| `NEO4J_TIMEOUT_SECONDS` | Per-query timeout (`0 < t <= 60`, default 5) before the graph is treated as unavailable |

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
# set BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD in .env (a real >=12-char
# password) - the .env.example placeholder is deliberately too short.
docker compose up --build
```

```bash
docker compose run --rm migrate         # apply DB migrations
docker compose run --rm bootstrap       # create the first Administrator (idempotent)
docker compose run --rm seed-demo       # load the curated demo dataset (idempotent, additive)
docker compose run --rm sync-topology   # full rebuild of the Neo4j graph projection (idempotent, optional)
```

Public registration only files a **pending access request**; the sole
deterministic way to get a usable Administrator is the `bootstrap` command
above. Then sign in at `/login` with `BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD` and approve other requests under **Administration →
Access requests**.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 · `/login` · `/register` · `/dashboard` |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Backend liveness | http://localhost:8000/api/v1/health/live |
| Backend readiness | http://localhost:8000/api/v1/health/ready |

The `migrate` / `bootstrap` / `seed-demo` / `sync-topology` services are
**one-shot** and never run on `docker compose up`. PostgreSQL publishes **no**
host port and lives on an `internal` network with no outbound route.
Frontend/backend host ports bind to `127.0.0.1` only.

**Neo4j** (`neo4j` service, image `neo4j:5.26.0-community`, pinned by digest)
*is* started by `docker compose up -d` by default, on the same `internal`
`data` network as PostgreSQL - like `db`, it publishes **no host port**
(diagnose with `docker compose exec neo4j cypher-shell` or the backend's own
`GET /api/v1/topology/health`, not a browser). It is entirely **optional**:
nothing else `depends_on` it being healthy, and stopping / removing it (or
unsetting `NEO4J_URI`) leaves relationship management and the rest of
InfraGuard fully usable - only the topology graph view degrades to a clear
"unavailable" state. After the stack is up, project the current PostgreSQL
relationships into the graph with `docker compose run --rm sync-topology`
(idempotent full rebuild; **not** run automatically on every `up`, so run it
once after the first `migrate` + `seed-demo`, and again any time you want to
refresh the projection).

## Database safety

`infraguard-ai_pgdata` and `infraguard-ai_neo4j_data` are **persistent
development data** - treat both as user-owned. Neo4j only ever holds a
**derived** projection (PostgreSQL stays canonical), but losing it is still
disruptive - it must be manually rebuilt with `sync-topology` - so it gets the
same protection as `pgdata`.

| Command | Verdict |
| --- | --- |
| `docker compose down` / `docker compose stop` | ✅ safe - stops/removes containers, keeps data |
| `docker compose down -v` | ⛔ **never** for the dev environment - it destroys `pgdata` **and** `neo4j_data` |
| `docker volume rm infraguard-ai_pgdata` / `infraguard-ai_neo4j_data` · `docker volume prune` · `docker system prune --volumes` | ⛔ never |
| drop / truncate / reset / recreate the dev database "for testing" | ⛔ never |

- **Regenerate demo data** with `docker compose run --rm seed-demo` - it is
  strictly additive and idempotent, and **never** resets PostgreSQL. It leaves
  user-created records, users, passwords, roles and audit history untouched.
- **Destructive testing** (integration suite, `upgrade`/`downgrade` migration
  cycles) runs against the **throwaway `db-test` service** - a separate
  `pgdata_test` volume on `127.0.0.1:55433`, never the main `db`:

  ```bash
  docker compose --profile test up -d db-test
  export INFRAGUARD_DISPOSABLE_DB=1     # explicit opt-in - the guard fails closed without it
  export TEST_DATABASE_URL=postgresql+psycopg://infraguard:infraguard_test_only@localhost:55433/infraguard_test
  cd backend && pytest -m ""
  docker compose --profile test down -v # safe: only the throwaway volume
  ```

  Any destructive DB helper refuses to run unless **both** `INFRAGUARD_DISPOSABLE_DB`
  is set truthy **and** the target database name is disposable (`test` / `*_test`)
  - a naming convention alone is not trusted (`app/core/db_safety.py`).

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
| `POST` | `/api/v1/auth/register` | Submit an **access request**: `{email, password}` → `201 {detail, account_status:"pending"}` · `409` duplicate (status-neutral) · `422` policy · `429`. No session, no roles. |
| `POST` | `/api/v1/auth/login` | `{email, password}` → `200` user + sets HttpOnly cookie · `401` (bad credentials) · `403 {detail:{code}}` where `code` ∈ `account_pending` / `account_rejected` / `account_disabled` (credentials were valid) · `429` |
| `POST` | `/api/v1/auth/logout` | Clears the auth cookie → `200` |
| `GET` | `/api/v1/auth/me` | Current user: identity + `account_status` + `roles` + effective `permissions` → `200` · `401` · `403` (pending / rejected / disabled) |
| `GET` | `/api/v1/assets` | List assets - `page` `page_size` `q` `asset_type` `environment` `criticality`\* `status`\* `is_active` → `200` (needs `assets.read`) |
| `GET` | `/api/v1/assets/summary` | Aggregate counts (`total` `active` `inactive` + `by_criticality` / `by_status` / `by_environment` / `by_type`, every catalog key present) → `200` (auth) |
| `POST` | `/api/v1/assets` | Create an asset → `201` · `422` (auth) |
| `GET` | `/api/v1/assets/{id}` | Asset detail → `200` · `404` (auth) |
| `PATCH` | `/api/v1/assets/{id}` | Partial content update → `200` · `404` · `410` (in Trash) · `422` (auth) |
| `POST` | `/api/v1/assets/{id}/deactivate` · `/reactivate` | Soft lifecycle toggle → `200` · `404` (auth) |
| `DELETE` | `/api/v1/assets/{id}` | Move to Trash (soft delete) → `200` · `404` · `409` (already trashed) (auth + CSRF) |
| `GET` | `/api/v1/incidents` | List incidents - `page` `page_size` `q` `severity`\* `status`\* `priority`\* `asset_id` `started_from` `started_to` `sort` → `200` (auth) |
| `GET` | `/api/v1/incidents/summary` | Aggregate counts (`open` `critical_open` `investigating` `monitoring` `resolved_recently` + `by_severity` / `by_status`) → `200` (auth) |
| `POST` | `/api/v1/incidents` | Create an incident (+ `CREATED` / `ASSET_ADDED` timeline) → `201` · `422` (auth + CSRF) |
| `GET` | `/api/v1/incidents/{id}` | Incident detail: metadata + affected assets + timeline → `200` · `404` · `410` (in Trash) (auth) |
| `PATCH` | `/api/v1/incidents/{id}` | Partial update; timeline event per change; `asset_ids` replaces the set → `200` · `404` · `410` · `422` (auth + CSRF) |
| `POST` | `/api/v1/incidents/{id}/resolve` · `/reopen` | Lifecycle → `200` · `404` (auth + CSRF) |
| `POST` | `/api/v1/incidents/{id}/comments` | Append a `COMMENT` timeline entry → `201` · `404` · `422` (auth + CSRF) |
| `DELETE` | `/api/v1/incidents/{id}` | Move to Trash (soft delete; keeps timeline + affected-asset links) → `200` · `404` · `409` (auth + CSRF) |
| `GET` | `/api/v1/audit` | List audit events (newest first) - `page` `page_size` `q` `action`\* `entity_type`\* `actor` `entity_id` `from` `to`; each row has `change_count` + a bounded `change_preview` → `200` (auth) |
| `GET` | `/api/v1/audit/summary` | "Activity today" counters (`events_today` `changes_today` `logins_today` `active_actors_today`) → `200` (auth) |
| `GET` | `/api/v1/audit/{id}` | One event: actor + entity + request context + field changes → `200` · `404` (auth) |
| `GET` | `/api/v1/trash/summary` | Trashed-record counts (`assets` `incidents`) → `200` (auth) |
| `GET` | `/api/v1/trash/assets` | List trashed assets - `page` (20, max 100) `q` `type` `criticality`\* `deleted_by` `from` `to` → `200` (auth) |
| `GET` | `/api/v1/trash/assets/{id}` | Trashed asset detail (read-only, + deleter/`deleted_at`) → `200` · `404` (auth) |
| `POST` | `/api/v1/trash/assets/{id}/restore` | Restore to the live module (same id) → `200` · `404` (auth + CSRF) |
| `GET` | `/api/v1/trash/incidents` | List trashed incidents - `page` (15, max 100) `q` `severity`\* `status`\* `deleted_by` `from` `to` → `200` (auth) |
| `GET` | `/api/v1/trash/incidents/{id}` | Trashed incident detail (read-only, + timeline + affected assets) → `200` · `404` (auth) |
| `POST` | `/api/v1/trash/incidents/{id}/restore` | Restore to the live module (same id, history intact) → `200` · `404` (needs `trash.restore` + CSRF) |
| `GET` | `/api/v1/relationships/types` | The 6-entry relationship taxonomy (code, Spanish label, inverse label, direction semantics) → `200` (auth) |
| `GET` | `/api/v1/relationships` | List relationships - `page` `page_size` (50, max 100) `source_asset_id` `target_asset_id` `asset_id` `relationship_type`\* `direction` → `200` (needs `relationships.read`) |
| `POST` | `/api/v1/relationships` | Create an edge `{source_asset_id, target_asset_id, relationship_type, description?}` → `201` · `404` (unknown/trashed asset) · `409` (duplicate edge) · `422` (self-link, unknown type) (needs `relationships.manage` + CSRF) |
| `GET` | `/api/v1/relationships/{id}` | Relationship detail incl. both endpoint Assets → `200` · `404` (needs `relationships.read`) |
| `PATCH` | `/api/v1/relationships/{id}` | Update **only** `relationship_type` / `description` - source/target are immutable by design → `200` · `404` · `409` (would duplicate) · `422` (needs `relationships.manage` + CSRF) |
| `DELETE` | `/api/v1/relationships/{id}` | Real delete (edges are not modeled in Trash) → `200` · `404` (needs `relationships.manage` + CSRF) |
| `GET` | `/api/v1/assets/{id}/relationships` | One asset's relationships, grouped `{outgoing, incoming, counts}` - no N+1 → `200` · `404` (needs `relationships.read` + `assets.read`) |
| `GET` | `/api/v1/topology/subgraph` | Bounded dependency graph around `root_asset_id` - `depth` (max 3) `direction` (`both`/`upstream`/`downstream`) `relationship_type`\* `environment` `criticality`\* `status`\* `node_cap` (max 500); response has `truncated: true` if capped → `200` · `404` (needs `relationships.read` + `assets.read`) |
| `GET` | `/api/v1/topology/assets/{id}/impact` | Read-only "potential impact": Assets reachable through **propagating** relationship types, with distance + path → `200` · `404` (needs `relationships.read` + `assets.read`) |
| `GET` | `/api/v1/topology/path` | One bounded shortest path between two Assets (`max_depth`, default/​max 3) → `200` · `404` (needs `relationships.read` + `assets.read`) |
| `GET` | `/api/v1/topology/health` | Neo4j graph status: `configured` / `operational` / `unavailable` / `not_configured` - **never** fails or affects overall platform health → `200` (auth) |
| `GET` | `/api/v1/admin/permissions` | Grouped permission catalog → `200` (needs `roles.read`) |
| `GET` | `/api/v1/admin/users` | List users - `page` (20, max 100) `q` `status` (`pending`/`active`/`rejected`/`disabled`) `role` (slug); each row carries `account_status` + its roles → `200` (needs `users.read`) |
| `GET` | `/api/v1/admin/access-requests` | Pending access requests, newest first - `page` `q` → `200` (needs `users.read`) |
| `GET` | `/api/v1/admin/users/{id}` | Identity + `account_status` + roles + effective permissions + `is_last_active_admin` → `200` · `404` (needs `users.read`) |
| `PATCH` | `/api/v1/admin/users/{id}` | Enable / disable an **active** account (`{is_active}`) → `200` · `404` · `409` (last admin, or account is pending / rejected) (needs `users.manage` + CSRF) |
| `POST` | `/api/v1/admin/users/{id}/approve` | Approve a request: `{role_ids}` (**≥ 1 required**) → activates + assigns roles → `200` · `404` · `409` (not pending/rejected) · `422` (no / unknown role) (needs `users.manage` + CSRF) |
| `POST` | `/api/v1/admin/users/{id}/reject` | Reject a pending request (kept in history, not deleted) → `200` · `404` · `409` (needs `users.manage` + CSRF) |
| `GET` · `PUT` | `/api/v1/admin/users/{id}/roles` | Read / replace the user's role set → `200` · `404` · `409` · `422` (needs `users.read` / `users.manage`) |
| `GET` | `/api/v1/admin/roles` | Every role + `user_count` / `permission_count` → `200` (needs `roles.read`) |
| `POST` | `/api/v1/admin/roles` | Create a custom role → `201` · `422` (needs `roles.manage` + CSRF) |
| `GET` | `/api/v1/admin/roles/{id}` | Permissions + assigned users → `200` · `404` (needs `roles.read`) |
| `PATCH` · `PUT` | `/api/v1/admin/roles/{id}` · `/permissions` | Rename / re-permission a **custom** role → `200` · `404` · `409` (system) · `422` (needs `roles.manage` + CSRF) |
| `DELETE` | `/api/v1/admin/roles/{id}` | Delete an unused custom role → `200` · `404` · `409` (system / assigned) (needs `roles.manage` + CSRF) |
| `GET` | `/api/v1/ai/capabilities` | Provider name / model / `ready`, message length limit, and the AI tool list with per-caller `available` flags → `200` (needs `ai.use`) |
| `GET` | `/api/v1/ai/conversations` | The caller's **own** conversations, most-recently-updated first - `page` `page_size` (30, max 100) → `200` (needs `ai.use`) |
| `POST` | `/api/v1/ai/conversations` | Start a conversation; optional `context` (`{asset_id}` \| `{incident_id}`) is re-fetched + permission-checked server-side (`404` if not visible / trashed) → `201` · `422` (needs `ai.use` + CSRF) |
| `GET` | `/api/v1/ai/conversations/{id}` | Conversation + full message list - **owner only**, otherwise `404` → `200` (needs `ai.use`) |
| `DELETE` | `/api/v1/ai/conversations/{id}` | Permanently delete the conversation + its messages (private history, **not** routed through Trash) - owner only → `200` · `404` (needs `ai.use` + CSRF) |
| `POST` | `/api/v1/ai/conversations/{id}/messages` | Send a user message; runs the grounded read-only orchestrator and returns `{user_message, assistant_message}` with evidence / entity refs / suggestions → `200` · `404` · `429` (per-user) · `503 {detail:{code,message}}` (provider unavailable / timeout / unsupported) (needs `ai.use` + CSRF) |
| `GET` | `/docs` · `/openapi.json` | Swagger UI / OpenAPI schema |
| `GET` | `/` | Service metadata |

All `/api/v1/assets*`, `/api/v1/incidents*`, `/api/v1/audit*`, `/api/v1/trash*`,
`/api/v1/admin*` and `/api/v1/ai*` endpoints require authentication
(`get_current_user`) **and the matching RBAC permission**
(`deps.require_permission`); an authenticated caller lacking the permission gets
**`403`** (never `401`, never a redirect).
State-changing methods also pass the `Origin`/`Referer` CSRF check. There is **no
permanent delete** - `DELETE` is a *soft delete* that sets `deleted_at` /
`deleted_by` and moves the record to **Trash**, from where it is fully
restorable. Incident `created_by` / timeline actor - and `deleted_by` - is always
the authenticated user, never a request-body value.

### RBAC & user administration (Governance Phase 3)

**Frontend visibility is not security** - every permission is enforced in the
backend; the frontend only mirrors it.

- **Permission catalog (19)**, grouped `assets` / `incidents` / `audit` /
  `trash` / `users` / `roles` / `ai` / `relationships` - codes like
  `assets.update`, `trash.restore`, `users.manage`, `ai.use`,
  `relationships.manage`. Codes are stable machine identifiers, never
  translated. `trash.purge` is *reserved and documented* for a future "empty
  Trash".
- **System roles** (immutable, un-deletable): **Administrator** (every
  permission - and any future one automatically), **Operator** (asset + incident
  operations + restore + `relationships.manage`, no `*.delete`, no admin),
  **Analyst** (read + audit + trash read + `relationships.read`), **Viewer**
  (asset + incident + `relationships.read`). **All four** system roles include
  `ai.use` - the AI Assistant is available to every user, and each AI tool
  separately requires the underlying domain read permission. Administrators can
  create fully-editable **custom roles**. Viewer is only *pre-selected* in the
  approve dialog - it is never auto-assigned.
- **Account lifecycle** (`account_status`, single source of truth; `is_active` is
  a derived read-only alias for `active`): `pending` → `active` / `rejected`, and
  `active` ⇄ `disabled` for runtime enable/disable.
- **Access-request flow** - public `POST /auth/register` creates a **`pending`**
  account with **no roles** that **cannot authenticate**. An administrator
  reviews it under **Administration → Access requests** and either **approves**
  it (must assign ≥ 1 role → account becomes `active`) or **rejects** it
  (→ `rejected`, kept in history so the email cannot be re-registered; can still
  be approved later). Registration never signs the user in and never redirects
  into the app.
- **First Administrator** - created only by the explicit, idempotent
  `python -m app.scripts.bootstrap_admin` command (env: `BOOTSTRAP_ADMIN_EMAIL`
  / `BOOTSTRAP_ADMIN_PASSWORD`), or granted by an already-authorized
  administrator. Public registration can **never** create an Administrator or an
  active account. There is no "first registered user becomes admin" behaviour
  and no auto-Viewer-on-registration.
- **Effective permissions** = the *union* across every assigned role (no per-user
  grants, no deny rules), resolved once per request, and **only for `active`
  accounts** - a `pending` / `rejected` / `disabled` account with stale role
  rows is still refused (backend checks status first).
- **Disabled / pending / rejected users** cannot log in **and** every protected
  request stops the moment the backend resolves the session (`403`).
- **Last-admin protection** - the system can never reach zero active
  Administrators: deactivating or de-roling the last one (self included) is a
  `409`, checked under a row lock (concurrency-safe). The bootstrap Administrator
  participates in this invariant normally - it is not "immortal".
- **`/admin`** frontend - a permission-gated tabbed **Users / Access requests /
  Roles** workspace with a grouped permission matrix, role assignment with a
  live effective-permission preview, an approve dialog that requires ≥ 1 role, a
  restrained pending-count on the Access-requests tab, and a **Forbidden** state
  (not a login redirect) for a direct visit without access. Every admin
  mutation is written to the audit log (`User` / `Role` entity types) -
  `CREATE` on registration, `STATUS_CHANGED` + `UPDATE` on approve / reject /
  enable / disable.

### AI Assistant (read-only infrastructure intelligence)

A grounded, permission-aware assistant that answers questions about **your actual
InfraGuard data** - not a general chatbot. **v1 is strictly read-only**: no AI
action can create, update, delete, restore or re-permission anything, approve
access requests, touch Trash or Audit, or bypass RBAC. Those belong to a future,
explicitly-confirmed action layer.

- **Grounding.** The assistant never answers infrastructure questions from
  memory. It retrieves data through a small **allow-listed set of read-only
  tools** (`search_assets`, `get_asset`, `summarize_assets`,
  `get_dashboard_overview`, `search_incidents`, `get_incident`,
  `summarize_incidents`, `get_incident_timeline`, `search_audit`,
  `get_audit_event`) - each with an explicit input schema, a bounded result size,
  a required permission and **no mutation path**. There is no arbitrary SQL, no
  raw query construction and no generic HTTP / shell / filesystem access. Every
  answer carries **evidence** (which tools ran, over how many records) and
  **entity references** (internal ids + safe labels) so you can see where it came
  from.
- **Permissions.** `ai.use` gates the Assistant; **each tool additionally
  enforces its domain permission** (`assets.read` / `incidents.read` /
  `audit.read`) at the tool boundary in the backend. A Viewer asking about Audit
  gets *"no tienes permiso"*, never audit data - the frontend is not involved in
  that decision. Users / Roles / Access-requests are **not** exposed to the AI in
  v1.
- **Provider abstraction.** No provider is hard-wired. `AI_PROVIDER` /
  `AI_MODEL` / `AI_API_KEY` select the backend adapter; **keys live backend-side
  only and are never sent to the browser**. The default (`deterministic`)
  provider needs **no API key** and is what tests, Docker and CI use - it runs
  the *real* tools against the *real* database, uses simple intent matching, and
  answers a bounded set of documented intents (asset / incident lookups and
  summaries, relationships, timelines, recent Audit changes, an infrastructure
  overview, plus a small **"what is InfraGuard AI / what can you do"** product
  intent whose capability list is scoped to the caller's permissions). Anything
  outside that scope returns *"Esta consulta requiere un proveedor de IA
  avanzado…"* - it never fabricates entities or facts. An optional `openai`
  adapter (stdlib HTTP, no new runtime dependency) sits behind the same
  abstraction. If a configured real provider is unavailable InfraGuard stays
  fully usable and the Assistant degrades gracefully (typed `503`; the user's
  message stays on screen and is retryable - the retry regenerates the turn
  rather than stacking a second copy; no fake answer).
- **Conversations.** `ai_conversations` + `ai_messages` (roles `user` /
  `assistant`). **Strict ownership** - a user only ever sees their own
  conversations; Administrator status does **not** grant read access to other
  users' private history. `DELETE` is a real delete (documented) and is **not**
  routed through operational Trash. Titles are derived deterministically from the
  first user message (no LLM call).
- **Prompt / tool-injection posture.** User messages are untrusted input. The
  backend authorises every tool call regardless of what a message says; a message
  telling the assistant to "ignore your rules", "show the DB password", "run
  `DELETE`", "read another user's conversations" or "use Audit without
  permission" cannot succeed because the enforcement is in code, not in the
  prompt. Secrets, hashes, tokens, cookies, env vars, SQL, stack traces and
  hidden prompts are never serialised into a response or sent to a provider.
- **Rate limiting.** AI message execution has its own **stricter per-user**
  fixed-window limiter (`AI_RATE_LIMIT_*`, default 20 / 60 s) → typed `429` with
  `Retry-After`, separate from ordinary reads.
- **AI auditing decision.** AI activity does **not** write audit events in v1: it
  performs no mutations to correlate, conversation content is already
  user-owned + user-visible, and the app does not audit direct reads either.
  Revisit when the action layer lands.

### Asset Relationships & Topology

Users model real dependencies between Assets (`prod-api-01 depends_on
prod-db-primary`), manage them, and explore the result as an interactive
dependency graph - **PostgreSQL is canonical**; **Neo4j is an optional,
backend-only, derived projection**, never the system of record.

- **Taxonomy (6 types, deliberately small)** - `depends_on` / `hosts` /
  `connects_to` / `uses` / `provides_service_to` / `member_of`, each with a
  stable code, Spanish label + inverse label, description, and an explicit
  **direction semantic**: if `A depends_on B`, `B` is *upstream* of `A` ("de
  qué depende") and `A` is *downstream* of `B` ("qué depende de él"). All six
  are stored **directed** internally, even the symmetric-feeling ones
  (`connects_to`), for v1 simplicity - `GET /api/v1/relationships/types` is the
  single source of truth, mirrored exactly in the frontend.
- **`asset_relationships`** - UUID PK, `source_asset_id` / `target_asset_id`
  (FK `assets.id`), `relationship_type`, optional `description`, `created_by`
  (FK `users.id`, `ON DELETE SET NULL`). `CHECK` constraints reject a
  **self-link** (`source == target`, `422`) and a **`UNIQUE`** constraint on
  `(source, target, relationship_type)` rejects an exact duplicate edge
  (`409`) - the reverse direction (`B → A`) is a distinct, valid edge. The
  relationship's **UUID is its stable identity** - renaming an Asset never
  breaks its graph edges.
- **Soft-delete interaction** - trashing an Asset does **not** cascade-delete
  its relationships: the rows remain in PostgreSQL, but every live query
  (`both_endpoints_live()`) excludes edges touching a trashed Asset, so the
  live topology and grouped relationship view simply omit it. Restoring the
  Asset makes its relationships reappear automatically - no explicit
  "reactivation" step, and no relationship history is ever lost.
- **`relationships.read` / `relationships.manage`** - two new, distinct
  permissions (catalog now **19**) rather than folding this into
  `assets.manage`, because topology is its own capability that will grow
  further (impact analysis, future AI graph tools). The topology query API
  additionally requires `assets.read`.
- **API** - `GET/POST /api/v1/relationships`, `GET/PATCH/DELETE
  /api/v1/relationships/{id}`, `GET /api/v1/assets/{id}/relationships`
  (grouped `{outgoing, incoming, counts}`, no N+1). `PATCH` can change only
  `relationship_type` / `description` - moving an edge to a different
  source/target means delete + re-create, by design. `DELETE` is a **real**
  delete (edges are not modeled in Trash - it has always represented
  operational entities, not edge metadata); both mutations are audited
  (`Relationship` entity type, `CREATE` / `UPDATE` / `DELETE`).
- **Asset detail → "Dependencias" tab** - a grouped relationship workspace
  (upstream / downstream / hosts / connects-to sections, not one big table), a
  restrained summary line (*"4 salientes · 7 entrantes · 11 relaciones"*, not
  six KPI cards), an **"+ Añadir relación"** dialog (type select + a
  server-searched Asset picker, paginated 20 at a time - never all Assets in
  one giant `<select>`), inline edit / delete behind a `ConfirmDialog`, and a
  **"Ver topología"** link into the dedicated workspace below.
- **`/topology`** - a dedicated, permission-gated workspace (own top-level
  route, not folded into Asset detail, since topology is a platform
  capability) built on **React Flow** (`@xyflow/react`) with `dagre` layout -
  the only graph library added, chosen for first-class React integration,
  custom node/edge components, and built-in pan/zoom/controls. Focus an Asset
  (`?asset_id=`), search, filter (environment / criticality / type / status /
  relationship type, collapsible), select a node or edge for an inspector,
  expand neighbors incrementally (merged by stable id, never a full refetch),
  and an inline, read-only **"Impacto potencial"** panel. Node color stays
  restrained - a neutral surface with a criticality/status accent, not one
  bright color per Asset type. An accessible **"Lista"** view (every node as a
  real focusable button) stands in for the graph on constrained input or for
  screen-reader users.
- **`GET /topology/subgraph`** is intentionally **bounded**, not a generic
  graph endpoint: default depth 1, max depth 3, a node cap (default 200, max
  500) with an honest `truncated: true` flag rather than silently dropping
  data - "Ajusta los filtros o enfoca un activo" if you hit it.
- **Impact analysis** (`GET /topology/assets/{id}/impact`) is **read-only** and
  walks only an explicit **propagating subset** of relationship types
  (`depends_on` / `uses` reverse; `hosts` / `provides_service_to` forward) -
  `connects_to` / `member_of` are informational only and never propagate.
  Traversal (impact **and** path-finding) tracks visited node ids so a cycle
  (`A → B → C → A`) can never infinite-loop; both are covered by dedicated
  tests.
- **The topology *query* path is PostgreSQL, not Neo4j** - a bounded, iterative
  breadth-first search directly against `asset_relationships` answers
  `/subgraph`, `/impact` and `/path`. This is a deliberate v1 design choice: it
  keeps a single source of truth for graph reads and means **Neo4j being
  unavailable never affects topology correctness** - only `GET
  /topology/health` reports `unavailable`, relationship management keeps
  working unchanged, and the graph UI shows a clear "Topología no disponible
  temporalmente" state (never fake data).
- **Neo4j is a real, working, separately-tested derived projection** (see
  `backend/app/services/graph/`) kept eventually consistent for future
  graph-native use: every relationship / Asset mutation attempts a **fast,
  best-effort sync immediately after the PostgreSQL commit** (never before,
  and a Neo4j failure never rolls back or blocks the mutation); `docker
  compose run --rm sync-topology` does an idempotent **full rebuild** from
  canonical PostgreSQL data, upserting current nodes/edges and pruning only
  stale **InfraGuard-managed** ones (never touching unrelated graph data).
  Cypher relationship types are drawn from a fixed backend allow-list - never
  built from unvalidated input - and every query is parameterized.
- **AI Assistant graph tools** - three new **read-only**, bounded,
  permission-gated tools (`get_asset_relationships`, `get_asset_neighbors`,
  `get_asset_impact`; each requires `relationships.read` **and**
  `assets.read`) extend the existing v1 tool layer - no new architecture, no
  write actions - enabling grounded answers like *"¿De qué depende
  prod-api-01?"* or *"¿Qué podría verse afectado si falla prod-db-primary?"*.
- **Not in scope for v1**: automatic discovery (network telemetry, CMDB /
  NetBox / cloud / Kubernetes), live traffic flow, graph ML / community
  detection, AI-generated relationship mutations, automated blast-radius
  remediation, historical topology snapshots, deep Incident-topology UI.

### Trash / soft delete (Governance Phase 2)

`DELETE /assets/{id}` and `DELETE /incidents/{id}` set `deleted_at` (timestamptz,
indexed) and `deleted_by` (FK `users.id`, `ON DELETE SET NULL`) — derived from
the session, never from the payload. `deleted_at IS NULL` is the live state.

- **Every normal query excludes trashed rows** — list, detail, both `/summary`
  endpoints, dashboard counts, search/filters, the incident asset picker, and an
  asset's related incidents. A trashed row is invisible to the operational app.
- Hitting a **normal** route for a trashed record returns **`410 Gone`** (not
  `404`) — the UI shows a small "this item is in Trash" notice with a link.
- The dedicated **Trash API** (`/api/v1/trash/*`) is the only read path for
  trashed rows: paginated lists with server-side filters, read-only detail, and
  `POST …/restore` which clears `deleted_at` / `deleted_by` and returns the row
  to the live module under the **same id**.
- Soft-deleting an incident keeps its **timeline** and **affected-asset links**;
  soft-deleting an asset keeps every `incident_assets` row, so incident history
  never corrupts (the asset shows as *En papelera*). Deleting an incident never
  touches an asset, and vice-versa.
- Each soft delete emits an audit **`DELETE`** event and each restore an audit
  **`RESTORE`** event, in the same transaction as the mutation (reusing the
  Phase 1 audit log — there is no second audit system).
- **No permanent purge** in this milestone — "empty Trash" / hard delete and the
  permission boundaries below are deferred to the RBAC phase. The code keeps
  those seams visible (`assets.delete`, `incidents.delete`, `trash.read`,
  `trash.restore`, `trash.purge`); today every authenticated user may do all of
  them.

The **audit log** is a centralized, append-only record of governance-relevant
actions (Asset / Incident `CREATE` · `UPDATE` with per-field `old → new` diffs ·
status / relation changes; `LOGIN` / `LOGOUT`). It answers *who* did *what*,
*when*, to *which* record. It is **read-only** — there is no create / update /
delete Audit API (those verbs return `405`) — and append-only is enforced at the
application layer, **not** by cryptography (a DBA can still edit rows directly).
Values for sensitive field names (`password`, `token`, `jwt`, `cookie`, …) are
never persisted; `LOGIN` / `LOGOUT` store the user id + email only. The
per-incident **timeline** (`incident_events`) and the audit log are deliberately
separate: the timeline is the operator narrative for one incident, the audit log
is the cross-system governance record. It also records **`DELETE`** (move to
Trash) and **`RESTORE`** events — see *Trash / soft delete* below. Audit history
is retained indefinitely and stays readable for records that are currently in
Trash (a retention policy and RBAC-gated access are future Governance phases).
All authenticated users can currently read the audit log.

The **Incident ↔ Asset** relationship is a real many-to-many (`incident_assets`
association table, not a JSON column); each incident carries a persisted
**timeline** (`incident_events`). Entering a terminal status (`Resolved` /
`Closed`) stamps `resolved_at`; reopening clears it. Asset dependency topology
and read-only impact analysis are implemented - see **Asset Relationships &
Topology** above. AI root-cause and automated correlation, and a dedicated
Incident-level "Topología afectada" view, remain **future** work.

\* `criticality`, `status`, `severity`, `priority`, `action`, `entity_type` and
`relationship_type` are **repeatable**
(`?status=Degraded&status=Offline` → `... IN (...)`); a single value still
works.
`/assets/summary` and `/incidents/summary` are read-only, use a handful of
`GROUP BY` queries, and report `0` for absent catalog values. The incident list's
`affected_asset_count` is a correlated sub-select (no N+1).

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
# integration - throwaway db-test only (see "Database safety"):
docker compose --profile test up -d db-test
INFRAGUARD_DISPOSABLE_DB=1 \
  TEST_DATABASE_URL=postgresql+psycopg://infraguard:infraguard_test_only@localhost:55433/infraguard_test \
  pytest -m ""
```

Integration tests **skip** (not fail) when `TEST_DATABASE_URL` is unset, and
**fail closed** when it is set without the `INFRAGUARD_DISPOSABLE_DB` opt-in or
against a non-disposable database name.

## Demo data

`python -m app.scripts.seed_demo` (or `docker compose run --rm seed-demo`) loads
a **curated, deterministic** dataset: ~70 assets and ~30 incidents across
Production / Staging / Test / Development, with a realistic spread of
criticality, severity, status and priority; incident↔asset relationships;
**~88 asset-to-asset relationships** forming recognizable, realistic clusters
(edge network → load balancer → web tier → API tier → {db, cache, message
queue}, plus identity, Kubernetes, storage/backup and monitoring groups -
never a random full-mesh); backdated timelines; matching audit history; a
handful of Trash records; and 3 pending access requests - enough to exercise
pagination, filters, search, the Dashboard KPIs and charts, Audit, Trash,
Administration and the Topology graph. Project it into Neo4j afterwards with
`docker compose run --rm sync-topology` (optional - the seed itself only
writes to PostgreSQL).

It is **strictly additive and idempotent**: deterministic ids
(`app/seeds/_common.py`) mean re-running it creates nothing new, and it never
drops / truncates / resets, never touches user-created records, and never
changes existing users, passwords, roles or audit history. It needs an active
Administrator as the audit actor (run `bootstrap` first). The data lives in
`app/seeds/` (`assets.py` / `incidents.py`); it is **not** a test fixture -
`tests/` stays isolated.

**Frontend** (Vitest + Testing Library; behavior-focused, no snapshots):

```bash
cd frontend
pnpm lint          # ESLint 9 flat config
pnpm typecheck
pnpm test          # vitest run
pnpm build
```

CI runs entirely on **ephemeral, disposable** databases (a throwaway service
container / the Compose stack on a fresh runner) - never a persistent volume - so
its `docker compose down -v` teardown is safe there and only there.

**CI** (`.github/workflows/ci.yml`) runs all of the above on every PR, then
builds the Compose stack (including an **ephemeral Neo4j** service - never a
persistent developer volume, never shared with a local dev graph), applies
migrations, runs the explicit `bootstrap` job (twice, to prove idempotency), a
**`seed-demo` smoke test** (seed → assert multi-page asset/incident counts,
Critical KPIs, Trash and access-request counts → seed again → counts
unchanged), and smoke-tests liveness, readiness, the auth / assets / incidents
/ audit APIs, the Trash + restore flow, the frontend routes, the
**access-request + RBAC** path (the bootstrapped Administrator logs in →
never-registered → a public registration is `pending` and cannot log in
(`403 account_pending`) → duplicate / different-casing registration is `409`
→ the admin approves it as Viewer → the approved user logs in with exactly the
Viewer permissions → a Viewer reads but cannot mutate (`403`, not `401`) → a
second request is rejected (`403 account_rejected`) → the last admin cannot
self-lock (`409`) → a disabled user is blocked (`403 account_disabled`) → the
changes are in the audit log), and the **relationships + topology** path:
create two Assets and an edge between them → self-link / duplicate rejected →
the asset-scoped grouped read and the `/topology/subgraph` + `/impact` queries
match → `sync-topology` genuinely projects the edge into Neo4j (verified with
`cypher-shell`, not just an HTTP `200`) → deleting the relationship removes it
from PostgreSQL immediately and from Neo4j via the best-effort incremental
sync → the mutations are audited; then a **Neo4j-outage** test stops the
`neo4j` container and asserts `/topology/health` reports `unavailable` while
the Assets API and relationship CRUD keep returning `200`, before restarting
Neo4j, resyncing, and confirming `operational` again.

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
- **Database safety:** `infraguard-ai_pgdata` is persistent data - never
  `down -v` / prune it. Destructive testing uses the throwaway `db-test` service,
  and a fail-closed guard (`INFRAGUARD_DISPOSABLE_DB` + disposable name) blocks
  destructive helpers from any other target. See **Database safety** above.
- Errors never leak stack traces, SQL, connection strings or credentials
  (DB-unavailable → generic `503`).
- **Container hardening (unchanged):** non-root users, `no-new-privileges`,
  `cap_drop: ALL`, read-only root FS for app containers + `tmpfs`.
- **Not implemented (by design):** RBAC / roles, OAuth, MFA, refresh-token
  rotation, server-side JWT revocation, password reset, email verification.

### Logout semantics

`POST /api/v1/auth/logout` clears the cookie. It does **not** revoke the JWT -
there is no server-side revocation, so an already-stolen token stays valid until
its `exp`. The session lifetime is **30 minutes** (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`,
raised from 15), which also widens that worst-case exposure window from ≤ 15 min
to ≤ 30 min. Short-access-token + rotating-refresh-token / server-side sessions
(with a `jti` denylist) are the documented next step - deferred to the Governance
milestone.

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
  contextual sun/moon toggle. (First-visit default became **dark** in the
  Product-Experience milestone.)
- Lightweight custom internationalisation (`src/i18n/`, no dependency):
  `LanguageProvider` / `useTranslation()`, typed keys, `es.ts` as the source of
  truth. (The `ES | EN` switcher shipped here was **removed** in the
  Product-Experience milestone - the visible UI is now Spanish-only.)
- Semantic CSS-variable design tokens + a small internal Tailwind component set
  (Button, Input, Card, Badge, Alert, PageHeader, Spinner, EmptyState, Reveal)
- Single self-contained centered authentication card (brand + language + theme
  live inside the card - nothing floats in the corners) on a restrained backdrop
- Authenticated app shell: desktop sidebar carries navigation **plus** theme,
  the signed-in identity and a confirmation-gated sign-out; the topbar is
  mobile-only; the same controls live in the mobile drawer. (The sidebar was
  regrouped and the Dashboard rebuilt with real data in the Product-Experience
  milestone.)
- Responsive 360-1440px, `prefers-reduced-motion` respected, keyboard-accessible
  navigation, language and theme controls

**Assets - Infrastructure Inventory**

- `Asset` model (UUID PK; `name` + `asset_type` / `environment` / `criticality` /
  `status` required, each DB-`CHECK`-constrained to a catalog; optional
  `hostname` / `ip_address` / `description` / `owner`; `is_active`; tz-aware
  timestamps) + Alembic migration (validated `upgrade → downgrade → upgrade`)
- Authenticated `/api/v1/assets` CRUD with pagination metadata, escaped `ILIKE`
  search (name / hostname / owner / IP), and catalog + active-state filters
- **Soft deactivation only** - no hard delete; lifecycle via dedicated
  `/deactivate` + `/reactivate` endpoints (`PATCH` is content-only)
- Frontend `/assets` (list + filters + search + pagination), `/assets/new`,
  `/assets/[id]` (detail + lifecycle actions), `/assets/[id]/edit`; a reusable
  `AssetForm`; Assets is now an **active** navigation item; catalog values are
  stored in English and translated only for display

**Product Experience**

- "Infrastructure operations console" visual direction; semantic tokens retuned
  centrally, `--sidebar` / `--info` / `--overlay` / `--chart-1..6` /
  `--auth-panel*` added; **dark is the default theme** for first-time visitors
  (an explicit choice still persists), light fully supported
- **Spanish-only** visible UI - `LanguageSwitcher` and the language preference
  removed; the typed i18n layer (`es.ts` source of truth, `en.ts` structurally
  validated) stays; product names (`InfraGuard AI`, `Dashboard`, `Assets`,
  `Incidents`, `AI Assistant`, `Settings`) stay English
- **Enterprise split** `/login` + `/register`: a deep branded slate panel
  (statement over a faint glow + restrained capability highlights + a node
  topology with one or two softly pulsing nodes, no fake stats) beside a focused
  auth card whose header holds the theme toggle; collapses to a single column on
  mobile. The auth flow itself is unchanged
- **Flat, collapsible sidebar** - single list (Dashboard / Assets / Incidents /
  AI Assistant / Settings), no section headings; future items `aria-disabled`
  with a quiet lock + "Próximamente" tooltip. Desktop collapse ↔ expand (~256 ↔
  ~68px, persisted); collapsed = icon rail with tooltips. `AppShell` is
  `h-[100dvh] overflow-hidden` and the **main pane** scrolls, so the full-height
  rail never appears cut off. Sign-out relabelled **"Salir"** (safe two-step /
  dialog unchanged)
- Reusable **overlay** foundation (`Overlay` / `Dialog` / `Drawer` /
  `ConfirmDialog` - portal, focus trap + restore, scroll lock incl. the main
  pane, Escape, a11y), **toast** and **skeleton** primitives
- `GET /api/v1/assets/summary` aggregation endpoint (auth, read-only, no schema
  change); `status` / `criticality` list filters accept repeated values
- Real operational **Dashboard**, deliberately calm: KPI row (drill hint + arrow
  on hover) + **one** criticality donut on a level-1 surface (large central
  metric, segment ↔ legend cross-highlight, accessible companion table) + a
  concise interactive "Estado actual" operational summary (status rows link into
  Assets; top-environment / top-type insights) + recently updated assets.
  **"Actualizar" really refetches** the summary, recent list and health check.
  The status / environment / type charts and the old platform-modules / account
  panels were removed from the composition (chart primitives kept)
- Assets page: filter **toolbar** card (search + selects, mobile-collapsible) +
  URL-driven active-filter **chip row** (`Limpiar todo`); table-row / status-row
  hover affordances; a small microinteraction language (button press, card and
  row transitions, chip animation) - all `prefers-reduced-motion` safe
- **Asset route-aware drawers** (Next.js Parallel + Intercepting Routes):
  navigating from `/assets` opens detail / create / edit in a right-side drawer
  over the still-mounted list; direct visits / refreshes of `/assets/[id]`,
  `/assets/new`, `/assets/[id]/edit` still render usable full pages. Close =
  `router.back()`, so filters / page are restored exactly. One shared
  detail-loader + form (no duplicated logic), success toasts, list auto-refresh,
  fresh-row highlight, skeletons, `ConfirmDialog`-over-drawer without stacking.
  Authenticated pages moved under an invisible `(app)` route group that provides
  `RequireAuth + AppShell` once

**Incident Management (v0.5)**

- `Incident` model + `incident_assets` (real many-to-many `Incident ↔ Asset`,
  association table - not a JSON column) + `incident_events` (persisted timeline);
  Alembic migration validated `upgrade → downgrade → upgrade`
- Severity (`Critical`–`Low`), status (`Open` / `Investigating` / `Identified` /
  `Monitoring` / `Resolved` / `Closed`), priority (`P1`–`P4`) - `StrEnum` + DB
  `CHECK`, same convention as Assets
- Authenticated `/api/v1/incidents` CRUD + `/summary` + `/resolve` · `/reopen` ·
  `/comments`; list has server-side search / filter / sort / pagination and an
  `affected_asset_count` correlated sub-select (**no N+1**); a mutation and its
  timeline event commit **atomically**
- Auto timeline events (created, status / severity / priority / owner change,
  asset add / remove, resolve, reopen, comment). Entering a terminal status
  stamps `resolved_at`; **reopening clears it** (documented decision)
- `Incidents` is now an **active** nav item. Route-aware drawers (same Parallel +
  Intercepting Routes architecture as Assets), interactive KPI overview, dense
  list + mobile cards, searchable **paginated** affected-asset picker, restrained
  timeline, Resolve / Reopen behind a confirm with toasts
- Dashboard gains a compact "Incidentes recientes" block; Asset detail gains a
  real "Incidentes relacionados" section (dependency topology shipped later -
  see **Asset Relationships & Topology** below)
- Not in scope: AI root-cause, automated correlation / alert ingestion

**Governance & Administration - Phase 1 (Audit Log)**

- `audit_events` + `audit_changes` tables (append-only; actor **and** entity
  **snapshots** so records survive user / entity deletion); Alembic migration
  validated `upgrade → downgrade → upgrade`
- One `record_event` service, emitted from the route layer in the **same
  transaction** as the mutation - a rolled-back request leaves no audit event
- Asset & Incident `CREATE` / `UPDATE` (per-field `old → new` diff, changed
  fields only) / `STATUS_CHANGED` / `RESOLVED` / `REOPENED` / `RELATION_CHANGED`;
  `LOGIN` / `LOGOUT`. Idempotent no-ops write nothing
- Sensitive-field denylist (`password` / `token` / `jwt` / `cookie` / …) → values
  never persisted; per-request correlation id (`X-Request-ID`), direct client IP
  only (no trusted-proxy header parsing)
- Read-only, append-only API (`GET /api/v1/audit` + `/summary` + `/{id}`; write
  verbs → `405`). Application-level append-only, **not** cryptographic. The list
  row carries a **bounded `change_preview`** (first 3 changes) fetched in one
  batched query — the timeline shows inline diffs with **no N+1**
- `Audit` is a new **active** nav item (English). `/audit` is a **system activity
  timeline** — date-grouped feed, inline change preview (`campo: antes → después`
  + `+N`), **"Cargar más"** over server-side pages, collapsible filter bar.
  Route-aware detail workspace: `Antes → Después` per field (stacked for long
  text), **no red/green**; `LOGIN` / `LOGOUT` show no changes section at all;
  `CREATE` shows its metadata snapshot
- **Semantic colour system** for the timeline — one hue per action family (CREATE
  emerald · UPDATE blue · STATUS_CHANGED amber · RESOLVED teal-green · REOPENED
  orange · RELATION_CHANGED indigo · LOGIN cyan · LOGOUT slate · DELETE red ·
  RESTORE violet) as `--audit-*` theme tokens; drives the node, the **segmented
  rail** (each connector inherits its event's hue) and the 3px card accent, from
  one catalog (`AUDIT_ACTION_VISUAL`). Colour stays confined — the card surface
  is neutral. `DELETE` / `RESTORE` visuals are ready for the future Trash phase
  but never emitted now
- Not in scope: soft delete, Trash, RBAC, user-role admin, retention/pruning,
  failed-login telemetry

**Governance & Administration - Phase 2 (Trash / Restore)**

- `deleted_at` (timestamptz, partial index `WHERE deleted_at IS NOT NULL`) +
  `deleted_by` (FK `users.id` `ON DELETE SET NULL`) on `assets` and `incidents`;
  Alembic migration validated `upgrade → downgrade → upgrade` + `alembic check`
- `DELETE /api/v1/assets/{id}` · `/incidents/{id}` → **soft delete** (actor from
  the session, `409` if already trashed, audit `DELETE` in the same transaction).
  Incident soft delete keeps its timeline + affected-asset links; asset soft
  delete keeps every `incident_assets` row
- **Every** live query excludes trashed rows (list, detail, both `/summary`,
  dashboard, search/filters, asset picker, related incidents). Normal routes for
  a trashed record return **`410 Gone`** (documented Option B — the UI shows an
  "in Trash" notice with a link, not a bare 404)
- Dedicated **Trash API** (`/api/v1/trash/*`): `summary`, paginated
  server-filtered lists (assets 20 / incidents 15 per page, max 100, deleter
  joined — **no N+1**), read-only detail, `POST …/restore` (clears the columns,
  audit `RESTORE`, same id)
- `Trash` is a new **active** nav item (English label; between Audit and AI
  Assistant). `/trash` is a URL-backed tabbed recovery workspace (`?type=assets`
  / `incidents`), compact summary strip (no KPI cards), route-aware read-only
  detail workspaces at `/trash/{assets,incidents}/{id}`, Restore behind a
  confirm. Neutral surfaces, subtle red for the deleted state, violet for restore
- Audit timeline / detail now render `DELETE` (red) and `RESTORE` (violet)
  events; audit history stays navigable for currently-trashed records
- Not in scope (deferred to RBAC): **permanent purge** / empty Trash, retention

**Governance & Administration - Phase 3 (RBAC & User Administration)**

- Normalized RBAC — `permissions` / `roles` / `user_roles` / `role_permissions`
  (one Alembic migration, validated `upgrade → check → downgrade → upgrade`); a
  16-permission catalog is the single source of truth for backend + frontend
- **Backend enforces every permission** — one reusable `require_permission`
  guard, applied across Assets / Incidents / Audit / Trash / Admin; an
  authenticated caller without the permission gets **`403`** (never `401`)
- Four immutable **system roles** (Administrator / Operator / Analyst / Viewer);
  Administrator holds every permission (incl. future ones). Administrators
  create / edit / delete **custom roles**
- **Access-request account lifecycle** (`account_status`:
  `pending` / `active` / `rejected` / `disabled`; email normalized + DB-unique on
  the normalized form). Public `POST /auth/register` files a **`pending`**,
  role-less request that cannot authenticate; an administrator **approves** it
  (≥ 1 role required → `active`) or **rejects** it (kept in history). No
  auto-Viewer, no auto-sign-in, no "first user becomes admin"
- **Explicit first-Administrator bootstrap** —
  `python -m app.scripts.bootstrap_admin` / `docker compose run --rm bootstrap`,
  env-driven (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`), idempotent,
  never resets an existing password, never runs on startup, never in production
  unless configured
- **last-admin lockout protection** (`409`, row-locked / concurrency-safe; the
  bootstrap admin participates normally); pending / rejected / disabled users
  blocked at auth **and** every request; effective permissions apply only to
  `active` accounts
- `GET /auth/me` now returns `account_status` + `roles` + effective
  `permissions`; a new `/api/v1/admin/*` API for user & role administration
  (list / access-requests / detail / approve / reject / enable-disable / role
  assignment / role CRUD / permission catalog) — all N+1-free
- `Administration` is a new **active**, permission-gated nav item — a tabbed
  **Users / Access requests / Roles** workspace, grouped permission matrix,
  approve dialog requiring ≥ 1 role with a live effective-permission preview,
  4-state status badges, polished **Forbidden** state (not a login redirect).
  `AuthProvider` exposes `can` / `canAny` / `canAll`; the UI checks permissions,
  never role names. Action affordances hidden without the permission
- Every administrative change is audited (`User` / `Role` entity types):
  `CREATE` on registration, `STATUS_CHANGED` + `UPDATE` on approve / reject /
  enable / disable
- Token lifetime unchanged: absolute 30-minute JWT, no refresh tokens
- Not in scope: SSO/OIDC, MFA, refresh-token rotation, multi-tenancy,
  teams/groups, temporary permissions, deny rules, row-level authorization,
  permanent Trash purge

**AI Assistant - v1 (read-only infrastructure intelligence)**

- New `ai.use` permission (catalog now **17**, group `ai`); granted to **all four**
  system roles. Each AI tool still enforces its own domain read permission at the
  backend/tool boundary - a Viewer cannot reach Audit data through the Assistant
- `ai_conversations` + `ai_messages` (one Alembic migration, validated
  `upgrade → check → downgrade → upgrade`). **Strict per-user ownership** - no
  cross-user reads, Administrators included. `DELETE` is a real delete, not Trash
- **Provider abstraction** (`AI_PROVIDER` / `AI_MODEL` / `AI_API_KEY`, keys
  backend-only). Default **deterministic** provider needs no API key, runs the
  real read-only tools against the real DB, and is what tests / Docker / CI use;
  optional `openai` adapter behind the same interface. Provider outage → typed
  `503`, user message preserved, InfraGuard stays fully usable
- **Allow-listed read-only tool layer** (10 tools, explicit schemas, bounded
  results, no mutation, no raw SQL). Grounded answers only - every response
  carries evidence + entity references; unknown entities are not invented
- Per-user **AI message rate limit** (stricter than ordinary reads) → typed `429`
- `AI Assistant` is now an **active**, `ai.use`-gated nav item - a first-class
  workspace (conversation rail + conversation + composer, mobile drawer),
  deterministic titles, entity cards that reuse existing detail routes, and
  **"Preguntar a la IA" / "Analizar con IA"** entry points on asset / incident
  detail (context id only; backend re-fetches + re-authorises)
- No AI auditing in v1 (documented): read-only, nothing to correlate
- **Explicit non-goals:** AI mutations / an action layer, autonomous or
  background agents, RAG / vector DB / embeddings, web browsing, voice, file
  uploads, multi-agent orchestration, LangChain / LlamaIndex

**Asset Relationships & Topology**

- `asset_relationships` (canonical PostgreSQL, UUID identity, 6-type
  taxonomy, self-link + duplicate-edge `CHECK`/`UNIQUE` constraints); Alembic
  migration validated `upgrade → check → downgrade → upgrade`
- New `relationships.read` / `relationships.manage` permissions (catalog now
  **19**) - Administrator + Operator get both, Analyst + Viewer read-only
- Full relationship CRUD API + an asset-scoped grouped read
  (`{outgoing, incoming, counts}`); soft-deleting an Asset excludes its
  relationships from every live query **without** cascade-deleting the rows -
  restoring the Asset brings them back automatically
- Asset detail gains a **"Dependencias"** tab (grouped by relationship type,
  restrained summary, searchable Asset picker for new edges) and a dedicated
  **`/topology`** workspace: an interactive graph (React Flow + dagre - the
  one graph library added) with search, filters, node/edge inspectors,
  incremental neighbor expansion, and a read-only **"Impacto potencial"**
  panel; an accessible **"Lista"** view stands in for the canvas
- Bounded topology query API (`/topology/subgraph` · `/impact` · `/path`) -
  default depth 1, max depth 3, a node cap with an honest `truncated` flag;
  answered by a cycle-safe, iterative PostgreSQL BFS (**not** Neo4j) so graph
  reads have one source of truth and Neo4j outages never affect correctness
- **Neo4j** (optional, Docker, backend-only) as a real, separately-tested
  **derived** graph projection - eventually-consistent best-effort sync after
  every PostgreSQL commit, plus an idempotent `sync-topology` full-rebuild
  command; a Neo4j outage degrades only the graph *view* (`GET
  /topology/health` → `unavailable`), never relationship management or the
  rest of the platform
- Three new **read-only** AI Assistant tools (`get_asset_relationships`,
  `get_asset_neighbors`, `get_asset_impact`; gated on `relationships.read` +
  `assets.read`) - no new AI architecture, no write actions
- CI gained relationship + topology API smoke tests (incl. a live Neo4j
  sync/projection check) and a Neo4j-outage-does-not-break-Assets-API smoke
  test, against an ephemeral, isolated Neo4j container
- Not in scope: automatic discovery (network telemetry / CMDB / NetBox /
  cloud / Kubernetes), live traffic flow, graph ML, AI-generated relationship
  mutations, automated blast-radius remediation, historical topology
  snapshots, a dedicated Incident-level topology view

### Planned (future phases)

- Governance Phase 4+: **permanent purge** of trashed records (`trash.purge`),
  audit **retention** policy, resource-/row-level authorization
- refresh-token rotation; JWT revocation; password reset; email verification;
  OAuth; MFA; SSO/OIDC
- Asset lifecycle / obsolescence tracking
- Incident-level **"Topología afectada" / impact** view (built on Asset
  Relationships & Topology + the v0.5 Incident ↔ Asset relationship)
- AI Assistant next steps: an explicitly-confirmed **action layer** (guarded,
  audited AI-initiated changes), streaming responses, retrieval over
  documentation
- Operational dashboards
- Kubernetes manifests + Helm chart (`infra/`), with Secrets / external secret manager
- CI/CD pipeline with security scanning and image publishing
- Observability stack (metrics, logs, traces)

## License

[MIT](LICENSE)
