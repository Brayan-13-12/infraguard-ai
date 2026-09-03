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
| `PATCH`| `/api/v1/assets/{id}`  | Partial content update (no `is_active`). **Auth + CSRF.** | `200` / `401` / `403` / `404` / `410` / `422` |
| `POST` | `/api/v1/assets/{id}/deactivate` \| `/reactivate` | Soft lifecycle toggle (idempotent). **Auth + CSRF.** | `200` / `401` / `403` / `404` |
| `DELETE` | `/api/v1/assets/{id}` | Move to Trash (soft delete; actor from session; audit `DELETE`). **Auth + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `GET`  | `/api/v1/incidents`    | List incidents (paginated; `q` search over `title`/`description`/`owner`; repeatable `severity`/`status`/`priority`; `asset_id`; `started_from`/`started_to`; `sort`). **Auth.** | `200` / `401` / `422` |
| `GET`  | `/api/v1/incidents/summary` | Aggregate counts (`open` / `critical_open` / `investigating` / `monitoring` / `resolved_recently` + `by_severity` / `by_status`). Read-only. **Auth.** | `200` / `401` / `503` |
| `POST` | `/api/v1/incidents`    | Create an incident (+ `CREATED` / `ASSET_ADDED` timeline). **Auth + CSRF.** | `201` / `401` / `403` / `422` |
| `GET`  | `/api/v1/incidents/{id}` | Incident detail: metadata + affected assets + timeline. **Auth.** | `200` / `401` / `404` / `410` |
| `PATCH`| `/api/v1/incidents/{id}` | Partial update; a timeline event per change. `asset_ids` replaces the affected set when sent. **Auth + CSRF.** | `200` / `401` / `403` / `404` / `410` / `422` |
| `POST` | `/api/v1/incidents/{id}/resolve` \| `/reopen` | Lifecycle: force `Resolved` / move a terminal incident to `Open` (idempotent). **Auth + CSRF.** | `200` / `401` / `403` / `404` |
| `POST` | `/api/v1/incidents/{id}/comments` | Append a `COMMENT` timeline entry. **Auth + CSRF.** | `201` / `401` / `403` / `404` / `422` |
| `DELETE` | `/api/v1/incidents/{id}` | Move to Trash (soft delete; keeps timeline + affected-asset links; audit `DELETE`). **Auth + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `GET`  | `/api/v1/audit`        | List audit events, newest first (paginated; `q`; repeatable `action` / `entity_type`; `actor`; `entity_id`; `from` / `to`). Each row: `change_count` + a bounded `change_preview` (≤3, one batched query - no N+1). **Auth.** | `200` / `401` / `422` |
| `GET`  | `/api/v1/audit/summary` | "Activity today" counters (`events_today` / `changes_today` / `logins_today` / `active_actors_today`). Read-only. **Auth.** | `200` / `401` / `503` |
| `GET`  | `/api/v1/audit/{id}`   | One event: actor + entity + request context + field changes. **Auth.** | `200` / `401` / `404` |
| `GET`  | `/api/v1/trash/summary` | Trashed-record counts (`assets` / `incidents`). **Auth.** | `200` / `401` |
| `GET`  | `/api/v1/trash/assets` | List trashed assets (paginated 20, max 100; `q`; `type`; repeatable `criticality`; `deleted_by`; `from` / `to`; deleter joined - no N+1). **Auth.** | `200` / `401` / `422` |
| `GET`  | `/api/v1/trash/assets/{id}` | Trashed asset detail (read-only + deleter / `deleted_at`). **Auth.** | `200` / `401` / `404` |
| `POST` | `/api/v1/trash/assets/{id}/restore` | Clear `deleted_at` / `deleted_by`; audit `RESTORE`; same id. **Auth + CSRF.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/trash/incidents` | List trashed incidents (paginated 15, max 100; `q`; repeatable `severity` / `status`; `deleted_by`; `from` / `to`). **Auth.** | `200` / `401` / `422` |
| `GET`  | `/api/v1/trash/incidents/{id}` | Trashed incident detail (read-only + timeline + affected assets). **Auth.** | `200` / `401` / `404` |
| `POST` | `/api/v1/trash/incidents/{id}/restore` | Restore (same id, history intact); audit `RESTORE`. **Auth + CSRF.** | `200` / `401` / `403` / `404` |

The audit log is **read-only + append-only**: there is deliberately no
`POST` / `PUT` / `PATCH` / `DELETE` route (those verbs → `405`).

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
- **Deactivation vs Trash - decision:** `deactivate` / `reactivate` is an
  *operational* lifecycle toggle - a deactivated asset stays fully queryable with
  `is_active=false`. `DELETE` is *removal from the working set* - a soft delete
  that sets `deleted_at` / `deleted_by` and hides the asset everywhere except
  Trash (see *Trash / soft delete*). The two are independent. `PATCH` stays
  content-only.
- **Known limits:** no trigram search index, no per-asset authorization (any
  authenticated user edits any asset - RBAC is a later phase), no bulk ops /
  import / export, last-write-wins on `PATCH`.

## Incidents (incident management)

`app/models/incident.py` - three tables:

- **`incidents`**: `id` (UUID PK), `title`, `description`, `severity`
  (`Critical`/`High`/`Medium`/`Low`), `status`
  (`Open`/`Investigating`/`Identified`/`Monitoring`/`Resolved`/`Closed`),
  `priority` (`P1`–`P4`), `owner`, `started_at` (defaults to now, backdatable),
  `detected_at`, `resolved_at`, `created_by` (FK → `users.id`, RESTRICT),
  tz-aware `created_at` / `updated_at`. Catalog fields are `varchar` + `CHECK`
  from a `StrEnum` - same convention as `Asset`. Indexes on `severity`,
  `status`, `priority`, `started_at`, `updated_at`, `created_at`.
- **`incident_assets`**: real many-to-many `Incident ↔ Asset`. Composite PK
  `(incident_id, asset_id)` is the uniqueness guarantee; both FKs
  `ON DELETE CASCADE`; index on `asset_id` for the "incidents affecting this
  asset" lookup. **Never** a JSON/array column.
- **`incident_events`**: persisted timeline. `type` (CHECK-constrained
  vocabulary), `message`, `created_by` (FK → `users.id`, SET NULL - nullable for
  future system events), `created_at`; index `(incident_id, created_at)`.

- **Timeline** (`app/services/incidents.py`): a mutation and its `IncidentEvent`
  rows commit in the **same unit of work** (the route calls `db.commit()` once).
  Auto events for create, status/severity/priority/owner change, asset add/remove,
  resolve, reopen, comment. Messages are persisted **in Spanish** (product
  content language); `type` is the language-neutral classification. Multi-event
  operations get monotonic timestamps so ordering is stable.
- **`resolved_at` / reopen - decision:** entering a terminal status stamps
  `resolved_at`; leaving one (reopen → `Open`) **clears it to `NULL`**. The prior
  resolution survives as `RESOLVED` / `REOPENED` timeline entries. Any
  status→status transition is allowed; the service picks the right event.
- **List** (`list_incidents`): `affected_asset_count` is a correlated
  scalar sub-select evaluated by PostgreSQL in the same query - **no N+1**.
  Search is an escaped `ILIKE` over `title` / `description` / `owner`.
  `sort` ∈ `recent` (default) / `oldest` / `started` / `severity`.
- **Validation** (`app/schemas/incident.py`): `extra="forbid"`; `created_by` and
  `resolved_at` are absent from the input models (derived server-side). Unknown
  `asset_ids` → `422`. `asset_ids` capped at 200 per request.
- **Security:** every endpoint requires auth; writes add the CSRF origin check;
  `created_by` / actor is taken from `get_current_user`, never the body.
- **Soft delete:** `DELETE /incidents/{id}` moves an incident to Trash without
  touching its timeline or affected-asset links (see *Trash / soft delete*).
- **Known limits / future milestones:** asset dependency topology, impact
  analysis, AI root-cause and automated correlation / alert ingestion are **not**
  implemented. No per-status transition guard, no per-incident authorization,
  last-write-wins on `PATCH`.

## Audit log (governance & administration - Phase 1)

`app/models/audit.py` - two tables (migration `b2c3d4e5f6a7`, validated
`upgrade → downgrade → upgrade`):

- **`audit_events`**: `id` (UUID PK), `occurred_at` (tz-aware, server-default
  `now()`), `action` / `entity_type` (`String` + `CHECK IN (…)` - same
  enum-as-check pattern as the rest of the schema), **entity snapshot**
  (`entity_id` *loose reference, no FK* + `entity_label`), **actor snapshot**
  (`actor_user_id` FK → `users.id` `ON DELETE SET NULL` **and** `actor_email`),
  request context (`request_id` / `ip_address` / `user_agent`), JSONB `metadata`
  (DB column `metadata`, Python attribute `event_metadata`). Indexes on
  `occurred_at`, `actor_user_id`, `action`, `entity_type`, `entity_id` and
  `(entity_type, entity_id)`.
- **`audit_changes`**: child rows (`ON DELETE CASCADE`), one per changed field -
  `field_name` (non-empty `CHECK`), `old_value` / `new_value` (safe-serialized
  text; `NULL` = the field really was null).

- **Write path** (`app/services/audit.py`): one `record_event(...)` function -
  the **only** writer. It **flushes but never commits**; the calling route owns
  the transaction, so an audit event is **atomic with the mutation it
  describes** - a rolled-back request writes nothing. Emission is at the
  **route layer** (`assets.py` / `incidents.py` / `auth.py`), after the domain
  service flushes and before the single `db.commit()`. `diff_fields()` records
  only fields that actually changed (`null ↔ value` handled); an idempotent
  no-op writes nothing. Incident `PATCH` can emit up to three events (`UPDATE` +
  a status action + `RELATION_CHANGED`).
- **Sensitive values are never persisted**: any field whose **name** contains a
  denylist token (`password`, `token`, `jwt`, `secret`, `cookie`,
  `authorization`, `api_key`, `refresh`, …) is stored as `[redacted]`;
  `metadata` is recursively scrubbed + size-capped. `LOGIN` / `LOGOUT` store
  `user.id` + `user.email` only - never the password, JWT or cookie. Failed
  logins are **not** audited in this phase (documented as future security
  telemetry).
- **Request context** (`app/api/request_context.py`): `request_id_middleware`
  attaches a short correlation id to every request (honours an inbound
  `X-Request-ID` only if it is a safe `[A-Za-z0-9._-]{1,64}` token) and echoes
  it. IP is the **direct** `request.client.host` - forwarded headers
  (`X-Forwarded-For`) are **not** trusted; IP / UA are context, never identity.
- **Read API** (`app/api/v1/routes/audit.py`): `GET` only. Append-only is
  enforced at the **application layer** - a DBA can still mutate rows directly,
  so this is **not** cryptographic tamper-proofing and is not claimed as such.
  Every endpoint requires auth; RBAC does not exist yet, so **all authenticated
  users can read the audit log**.
- **List `change_preview`** (`list_audit_events`): each list row carries the true
  `change_count` **and** a bounded `change_preview` (first `CHANGE_PREVIEW_LIMIT`
  = 3 change rows, `field_name` order) so the frontend timeline shows inline
  diffs without a per-row `GET /audit/{id}`. It stays **two queries per page** -
  the page + one batched `WHERE audit_event_id IN (…)` fetch - regardless of page
  size. Stored `old_value`/`new_value` were redacted at write time, so the
  preview reads them verbatim and cannot leak a secret. The full change set stays
  exclusive to the detail endpoint.
- **`IncidentEvent` vs `AuditEvent`**: kept separate on purpose - the timeline
  is the per-incident operator narrative (Spanish), the audit log is the
  cross-system governance record (English vocabulary).
- **Known limits / future:** no cryptographic integrity; **no retention /
  pruning** (history kept indefinitely - a 90/180/365-day policy is deferred);
  no RBAC-gated access; `ROLE_*` / `PERMISSION_CHANGED` (RBAC) are reserved in the
  vocabulary but never emitted; values are truncated at 8 000 chars.
- **`DELETE` / `RESTORE`** are emitted by the Trash phase (below), reusing this
  same `record_event` path - there is no second audit system.

## Trash / soft delete (governance & administration - Phase 2)

Migration `c3d4e5f6a7b8` (validated `upgrade → downgrade → upgrade` +
`alembic check`) adds to **both** `assets` and `incidents`:

- **`deleted_at`** (`timestamptz`, nullable) - `NULL` = live, non-`NULL` =
  trashed. Partial index `ix_{table}_deleted_at WHERE deleted_at IS NOT NULL`
  (the Trash lists are the only readers, and they always filter on it).
- **`deleted_by`** (`UUID` FK → `users.id` `ON DELETE SET NULL`, nullable) - set
  from `get_current_user`, **never** from the request body.

Design:

- **Live-query exclusion is explicit, not a global filter.** `app/services/
  assets.py` / `incidents.py` expose `_live()` / `_live_incident()` /
  `_live_asset()` (`col.deleted_at.is_(None)`) that every list `_conditions()`,
  every `/summary` `GROUP BY`, and the incident asset-existence check prepend.
  This matches the codebase style (no SQLAlchemy events / magic) and keeps the
  Trash path a deliberate opt-in. `get_asset` / `get_incident` stay plain PK
  fetches; the **route** decides policy.
- **Normal route on a trashed record → `410 Gone`** (`_IN_TRASH`), distinct from
  `404`. `DELETE` on an already-trashed record → `409 Conflict`.
- **`app/services/trash.py`** is the dedicated read/mutate path:
  `list_trashed_assets` / `list_trashed_incidents` (server-side filters +
  pagination, `outerjoin(User)` for the deleter email and a correlated
  affected-count sub-select - **no N+1**), `get_trashed_*`, `trash_summary`,
  `soft_delete_asset` / `restore_asset` (+ incident equivalents). Mutators set /
  clear the two columns and `flush` - they **never commit** (the route does),
  so the mutation + its audit `DELETE` / `RESTORE` event are one transaction.
- **Relationships survive.** Incident soft delete does not touch
  `incident_events` or `incident_assets`; asset soft delete does not touch
  `incident_assets`. `get_incident_detail` does **not** filter trashed assets out
  of the affected list - they flow through with `deleted_at` populated so the UI
  can badge them. Restore just clears the columns; the same id reappears with its
  full history.
- **API** (`app/api/v1/routes/trash.py`, prefix `/trash`,
  `dependencies=[Depends(get_current_user)]`): `summary`, `assets` /
  `assets/{id}` / `assets/{id}/restore`, and the incident triplet. Restores add
  the CSRF origin check.
- **RBAC readiness:** the future permission boundaries (`assets.delete`,
  `incidents.delete`, `trash.read`, `trash.restore`, `trash.purge`) are named in
  comments at each seam; today every authenticated user may do all of them.
- **Not implemented (deferred to RBAC):** permanent purge / "empty Trash" (no
  hard-delete endpoint exists), retention of trashed rows, per-user
  authorization.

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
email or password material. Lifetime `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`
(**default 30**) is the *single* config value: `access_token_expires_seconds`
derives the cookie `Max-Age` from it and `create_access_token` derives the JWT
`exp` from it, so they never drift. Validation enforces signature, issuer,
expiry and the required claims; malformed / expired / wrong-type / `alg=none`
tokens are rejected.

**No refresh tokens and no server-side revocation.** Clearing the cookie on
logout does not invalidate an **already-stolen** token - it stays valid until
`exp`. Raising the lifetime 15 → 30 min widens that worst-case window
accordingly. A short-access-token + rotating refresh token / server-side session
(with a `jti` denylist) is the next hardening step - deferred to Governance.
`JWT_SECRET` rotation / a KMS-managed key is a deployment-phase concern.

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
never duplicated into Alembic files. Five migrations so far: `users` → `assets` →
`incidents` (+ `incident_assets` / `incident_events`) → `audit_events` /
`audit_changes` → `c3d4e5f6a7b8` *add soft delete to assets and incidents*
(chained via `down_revision`). Each was hand-reviewed and validated on the Docker
PostgreSQL (`upgrade → downgrade → upgrade`, plus `alembic check` shows no
model/DB drift).

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
  DB-error → generic `503`), plus **Trash / restore** (`test_trash_api.py`):
  asset & incident soft delete / restore, already-deleted → `409`, missing →
  `404`, normal route → `410`, exclusion from list / summary / picker, timeline &
  relationships survive, and a failed delete / restore leaves **no** audit event.
  An `auth_client` fixture provides a logged-in client.

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
