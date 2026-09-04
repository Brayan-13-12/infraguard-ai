# InfraGuard AI - Backend

FastAPI service for InfraGuard AI.

* **v0.1** - health endpoints (liveness / readiness / summary) + wiring.
* **v0.2** - authentication & identity: the first persistent entity (`User`),
  registration / login / logout / `me`, Argon2id password hashing, JWT access
  tokens delivered as an HttpOnly cookie, the first Alembic migration.
* **Assets** - infrastructure inventory: the `Asset` entity, authenticated
  `/api/v1/assets` CRUD with pagination / search / filters and soft
  deactivate / reactivate, second Alembic migration.
* **Asset Relationships & Topology** - canonical `asset_relationships` in
  PostgreSQL, a bounded topology query API (subgraph / impact / path) answered
  by a cycle-safe PostgreSQL BFS, and an optional, backend-only, eventually
  consistent Neo4j graph projection. See *Asset Relationships & Topology*
  below.

## Layout

```
app/
├── api/
│   ├── deps.py      # get_current_user, CSRF origin check, rate limiter
│   ├── errors.py    # sanitized 422 validation handler + generic 503 for DB-unavailable
│   └── v1/routes/   # health, auth, assets, incidents, audit, trash, admin, ai,
│                    # relationships, topology
├── core/            # config.py, security.py (Argon2 + JWT), ratelimit.py
├── db/              # engine, session, declarative base, registry
├── models/          # user, asset, incident, audit, rbac, ai, relationship (+ catalog StrEnums)
├── schemas/         # per-domain request/response models (incl. ai.py, relationship.py, topology.py)
├── main.py          # app factory + no-store middleware for /api/v1/auth/*
├── scripts/         # bootstrap_admin.py, seed_demo.py, sync_topology.py
└── services/        # health, users, assets, incidents, audit, rbac, ai/, relationships.py,
                     # topology.py, graph/ (client.py, sync.py - Neo4j projection)
alembic/versions/    # 9 migrations: users → assets → incidents → audit → soft-delete → rbac
                     # → lifecycle → ai → asset relationships (+ widens the audit entity-type CHECK)
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
| `POST` | `/api/v1/auth/register`| Submit an **access request** → `pending` account, no roles, no session. Status-neutral `409` on a duplicate (normalized email). | `201` / `409` / `422` / `429` |
| `POST` | `/api/v1/auth/login`   | Authenticate; sets the `infraguard_access` HttpOnly cookie. `403 {detail:{code}}` (`account_pending` / `account_rejected` / `account_disabled`) when credentials are valid but the account is not `active`. | `200` / `401` / `403` / `429` |
| `POST` | `/api/v1/auth/logout`  | Clear the auth cookie. | `200` |
| `GET`  | `/api/v1/auth/me`      | Current user: identity + `account_status` + `roles` + effective `permissions`. | `200` / `401` / `403` (pending / rejected / disabled) |
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
| `POST` | `/api/v1/trash/incidents/{id}/restore` | Restore (same id, history intact); audit `RESTORE`. **`trash.restore` + CSRF.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/relationships/types` | The 6-entry relationship taxonomy (code, labels, direction, propagation). **Auth.** | `200` / `401` |
| `GET`  | `/api/v1/relationships` | List relationships (paginated 50 max 100; `source_asset_id` / `target_asset_id` / `asset_id`; repeatable `relationship_type`; `direction`). **`relationships.read`.** | `200` / `401` / `403` / `422` |
| `POST` | `/api/v1/relationships` | Create an edge (source ≠ target; both live; no duplicate `(source,target,type)`; audit `CREATE`). **`relationships.manage` + CSRF.** | `201` / `401` / `403` / `404` / `409` / `422` |
| `GET`  | `/api/v1/relationships/{id}` | Detail incl. both endpoint Assets. **`relationships.read`.** | `200` / `401` / `403` / `404` |
| `PATCH`| `/api/v1/relationships/{id}` | Update `relationship_type` / `description` **only** (source/target are structurally absent from the schema, `extra="forbid"`; audit `UPDATE`). **`relationships.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` / `422` |
| `DELETE` | `/api/v1/relationships/{id}` | Real delete (not Trash; audit `DELETE`; best-effort Neo4j edge removal after commit). **`relationships.manage` + CSRF.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/assets/{id}/relationships` | One asset's relationships, grouped `{outgoing, incoming, counts}` (two bounded queries - no N+1). **`relationships.read` + `assets.read`.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/topology/subgraph` | Bounded BFS subgraph around `root_asset_id` (`depth` max 3, `direction`, repeatable `relationship_type`, `environment`/`criticality`/`status` filters, `node_cap` max 500; `truncated` flag). **`relationships.read` + `assets.read`.** | `200` / `401` / `403` / `404` / `422` |
| `GET`  | `/api/v1/topology/assets/{id}/impact` | Read-only impact: Assets reachable through **propagating** relationship types only, with distance + path; cycle-safe. **`relationships.read` + `assets.read`.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/topology/path` | One bounded shortest path between two Assets (undirected BFS, cycle-safe, `max_depth` max 3). **`relationships.read` + `assets.read`.** | `200` / `401` / `403` / `404` |
| `GET`  | `/api/v1/topology/health` | Neo4j status: `configured` / `operational` / `unavailable` / `not_configured`. **Never** raises and never affects `/health`. **Auth.** | `200` / `401` |
| `GET`  | `/api/v1/admin/permissions` | Grouped permission catalog. **`roles.read`.** | `200` / `401` / `403` |
| `GET`  | `/api/v1/admin/users` | List users (`page` 20 max 100; `q`; `status` = `pending`/`active`/`rejected`/`disabled`; `role` slug; roles batched - no N+1). Rows carry `account_status`. **`users.read`.** | `200` / `401` / `403` / `422` |
| `GET`  | `/api/v1/admin/access-requests` | Pending requests, newest first (`page`, `q`). **`users.read`.** | `200` / `401` / `403` |
| `GET`  | `/api/v1/admin/users/{id}` | Identity + `account_status` + roles + effective permissions + `is_last_active_admin`. **`users.read`.** | `200` / `401` / `403` / `404` |
| `PATCH`| `/api/v1/admin/users/{id}` | Enable / disable an **active** account `{is_active}` (audit `STATUS_CHANGED`). `409` if pending / rejected, or the last admin. **`users.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `POST` | `/api/v1/admin/users/{id}/approve` | Approve a `pending` / `rejected` request: `{role_ids}` (**≥ 1**) → `active` + roles (audit `STATUS_CHANGED` + `UPDATE`). | `200` / `401` / `403` / `404` / `409` / `422` |
| `POST` | `/api/v1/admin/users/{id}/reject` | Reject a `pending` request → `rejected` (kept, not deleted; audit `STATUS_CHANGED`). **`users.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `GET` \| `PUT` | `/api/v1/admin/users/{id}/roles` | Read / replace the role set (audit `UPDATE`). **`users.read` / `users.manage`.** | `200` / `401` / `403` / `404` / `409` / `422` |
| `GET`  | `/api/v1/admin/roles` | Every role + `user_count` / `permission_count` (2 aggregate queries). **`roles.read`.** | `200` / `401` / `403` |
| `POST` | `/api/v1/admin/roles` | Create a custom role (audit `CREATE`). **`roles.manage` + CSRF.** | `201` / `401` / `403` / `422` |
| `GET`  | `/api/v1/admin/roles/{id}` | Permissions + assigned users. **`roles.read`.** | `200` / `401` / `403` / `404` |
| `PATCH`| `/api/v1/admin/roles/{id}` | Rename / re-describe a **custom** role (audit `UPDATE`). **`roles.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `PUT`  | `/api/v1/admin/roles/{id}/permissions` | Replace a **custom** role's permissions (audit `PERMISSION_CHANGED`). **`roles.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` / `422` |
| `DELETE`| `/api/v1/admin/roles/{id}` | Delete an unused custom role (audit `DELETE`). **`roles.manage` + CSRF.** | `200` / `401` / `403` / `404` / `409` |
| `GET`  | `/api/v1/ai/capabilities` | Provider (`name` / `model` / `ready`), `message_max_length`, and the tool list with a per-caller `available` flag. **`ai.use`.** | `200` / `401` / `403` |
| `GET`  | `/api/v1/ai/conversations` | The caller's **own** conversations, `updated_at DESC, id DESC` (`page`, `page_size` 30 max 100; correlated `message_count`, no N+1). **`ai.use`.** | `200` / `401` / `403` / `422` |
| `POST` | `/api/v1/ai/conversations` | Start a thread. Optional `context` = `{asset_id}` \| `{incident_id}` (never both) is re-fetched + permission- + liveness-checked server-side. **`ai.use` + CSRF.** | `201` / `401` / `403` / `404` / `422` |
| `GET`  | `/api/v1/ai/conversations/{id}` | Thread + full ordered message list. **Owner only** - a non-owner (Administrator included) gets `404`, not `403`. **`ai.use`.** | `200` / `401` / `403` / `404` |
| `DELETE`| `/api/v1/ai/conversations/{id}` | Real delete of the thread + its messages (private history; **not** Trash). Owner only. **`ai.use` + CSRF.** | `200` / `401` / `403` / `404` |
| `POST` | `/api/v1/ai/conversations/{id}/messages` | Persist the user turn, run the grounded read-only orchestrator, persist the assistant turn. Returns `{conversation_id, title, user_message, assistant_message}` with `evidence` / `entities` / `suggestions`. Owner only; per-user rate limit; provider failure → typed `503 {detail:{code,message}}` (`provider_unavailable` / `provider_timeout` / `provider_unsupported` / `tool_failure`) with the user turn preserved. **`ai.use` + CSRF.** | `200` / `401` / `403` / `404` / `422` / `429` / `503` |

Every `assets` / `incidents` / `audit` / `trash` / `admin` / `ai` endpoint requires
authentication **and the matching RBAC permission** (`deps.require_permission`) -
an authenticated caller without it gets **`403`** (never `401`). See
*RBAC & user administration* and *AI Assistant* below.

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
- **Authorization (Phase 3):** reads need `trash.read`, restores need
  `trash.restore`. Moving something *to* Trash stays `assets.delete` /
  `incidents.delete` on the domain APIs.
- **Not implemented (deferred):** permanent purge / "empty Trash" (no hard-delete
  endpoint; `trash.purge` reserved), retention of trashed rows.

## RBAC & user administration (governance & administration - Phase 3)

**Frontend visibility is not security.** Every permission is enforced here; the
frontend mirrors it.

### Model

`app/models/rbac.py` - four tables (migration `d4e5f6a7b8c9`, validated
`upgrade → check → downgrade → upgrade`):

- **`permissions`** - `code` UNIQUE (`assets.read` …), `description`. A stable
  machine identifier, never translated.
- **`roles`** - `name` / `slug` UNIQUE, `description`, `is_system`. `is_system`
  marks the four built-ins; their identity + permissions are **owned by code**
  and cannot be changed through the API.
- **`user_roles`** - composite PK `(user_id, role_id)` (no duplicate
  assignments); `assigned_by` FK -> `users.id` `SET NULL` (a snapshot of who
  assigned it). Index on `role_id` for the reverse lookup.
- **`role_permissions`** - composite PK `(role_id, permission_id)`. Index on
  `permission_id`.

All FKs `ON DELETE CASCADE` except `assigned_by`.

### Catalog + system roles (`app/services/rbac.py`)

`PERMISSION_CATALOG` (16 entries) is the single source of truth - adding a row +
a migration that seeds it is all it takes to introduce a permission, and
**Administrator picks it up automatically** (its permission set is computed from
`ALL_PERMISSION_CODES`). Groups: `assets` / `incidents` / `audit` / `trash` /
`users` / `roles`. `trash.purge` is *reserved and documented* - not seeded.

`SYSTEM_ROLES`: Administrator (all), Operator (asset + incident ops + restore, no
`*.delete`, no admin), Analyst (read + audit + trash read), Viewer (asset +
incident read). `ensure_system_roles` re-syncs their names + permission sets on
every seed run; `seed_rbac` is called by the migration **and** the
integration-test fixture. `DEFAULT_ROLE_SLUG = "viewer"` is only the
*pre-selection* in the approve dialog - roles are never auto-assigned.

### Account lifecycle + the access-request flow

`AccountStatus` (`pending` / `active` / `rejected` / `disabled`) on
`users.account_status` is the single source of truth; `User.is_active` is a
read-only `@property` (`== "active"`). Email is normalized (`.strip().lower()`,
`normalize_email`) and **DB-unique** on the normalized value (plus a
`email = lower(email)` CHECK); duplicate registration - exact, different case, or
surrounding whitespace - is a **status-neutral `409`**.

- `POST /auth/register` → `create_user(..., account_status=PENDING)` - a
  role-less request that cannot authenticate. `record_event(CREATE, USER)`.
- `services.rbac.approve_user(target, role_ids, actor)` - requires ≥ 1 valid
  role, sets `account_status = ACTIVE`, grants the roles (`ValueError` on none /
  unknown, `AccountStateError` if not `pending` / `rejected`).
- `services.rbac.reject_user(target, actor)` - `pending → rejected` only. The row
  is **kept** (history + re-registration block); a later `approve_user` can
  still activate it.
- **First Administrator**: `services.bootstrap.ensure_bootstrap_admin` /
  `python -m app.scripts.bootstrap_admin`, driven by `BOOTSTRAP_ADMIN_EMAIL` /
  `BOOTSTRAP_ADMIN_PASSWORD` (validated: real email, password within the app
  policy). Creates the account only if absent; otherwise activates + grants
  Administrator **without touching the password**. Idempotent, explicit (never
  on startup), and never auto-runs in production. There is **no** migration
  heal and **no** "first registered user becomes admin".

### Resolution + the guard

`resolve_effective_permissions(db, user_id)` - one JOIN query, the **union** of
every assigned role's permissions (no per-user grants, no deny rules).
`deps.get_current_permissions` caches it on `request.state` (one resolution per
request, shared by every guard and `/auth/me`).

`deps.require_permission("assets.update")` is the **only** authorization guard -
`get_current_user` runs first (**401** unauthenticated, **403** for a
non-`active` account), then this returns **403** when the permission is absent.
Never inline in a route body. Per-endpoint on Assets / Incidents; router-level on
Audit (`audit.read`) and Trash (`trash.read`, + per-endpoint `trash.restore`);
on every `/admin` route. Effective permissions are honoured **only for `active`
accounts** - a `pending` / `rejected` user with stale `user_roles` rows is still
refused because status is checked first.

### Non-active accounts (pending / rejected / disabled)

`authenticate()` checks **only the password** (constant-time, dummy-verify for an
unknown email); the route then inspects `account_status` and returns
`403 {detail:{code, message}}` (`account_pending` / `account_rejected` /
`account_disabled`) - never a misleading "wrong password" for a correctly
authenticated but non-active account, and never a status leak for a wrong
password. `get_current_user` raises the same `403` on every protected request
the moment the session is resolved, not just at next login.

### Last-admin lockout protection

Invariant: **>= 1 active user holds the Administrator role**. `set_user_active` /
`set_user_roles` call `_assert_admins_remain`, which `SELECT ... FOR UPDATE`-locks
the current admin `users` rows before counting - the check and the mutation are
effectively atomic under concurrent requests. Removing the last active admin
(deactivate, or strip the role - self included) is a **`409`**; two active admins
-> either may step down. A blocked mutation rolls back with **no** audit event.

### Admin API + audit

`app/api/v1/routes/admin.py` (prefix `/admin`). List queries are N+1-free (user
roles batched by `IN`, role counts via two `GROUP BY`s). Every mutation writes to
the Phase-1 audit log (`User` / `Role` entity types, already in the CHECK):
`STATUS_CHANGED` (activate), `UPDATE` (roles / role rename), `CREATE` / `DELETE`
(custom role), `PERMISSION_CHANGED` (role permissions).

### Token lifetime

Unchanged: an **absolute** 30-minute HS256 JWT
(`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, tested in `tests/unit/test_security.py`; the
auth-cookie `Max-Age` tracks it). No refresh tokens, no activity extension, no
revocation.

## AI Assistant (read-only intelligence - v1)

`app/services/ai/` + `app/api/v1/routes/ai.py` + `app/models/ai.py` +
`app/schemas/ai.py`. A grounded, permission-aware assistant over the caller's
**real** InfraGuard data. **v1 performs no mutations** of operational data - no
create / update / delete / restore / re-permission, no Trash, no Audit writes, no
RBAC bypass. A future explicitly-confirmed action layer owns that.

### Module layout

```
app/services/ai/
├── conversations.py   # ownership-scoped CRUD, deterministic title derivation
├── context.py         # resolve + permission/liveness-check an asset/incident context
├── tools.py           # THE SECURITY BOUNDARY - allow-listed read-only tools
├── orchestrator.py    # run_turn(): persist user msg, commit, run provider, persist reply
└── providers/
    ├── base.py          # AIProvider ABC, ProviderRequest/Result, SYSTEM_BOUNDARY
    ├── deterministic.py  # default; no API key; real tools + intent matching
    ├── openai.py         # optional; stdlib urllib; behind the same ABC
    └── __init__.py       # build_provider() from settings; lru_cache; get_provider()
```

### Persistence

`ai_conversations` (`id`, `user_id` → `users.id` `ON DELETE CASCADE`, `title`,
nullable `context_type` / `context_id` with set-together + enum CHECKs,
`created_at`, `updated_at`) and `ai_messages` (`id`, `conversation_id` →
`ai_conversations.id` `ON DELETE CASCADE`, `role` CHECK `IN ('user','assistant')`,
`content`, bounded sanitized `metadata` JSONB, `created_at` with **both** a Python
`default` and a `server_default` so turn ordering is deterministic even under the
savepoint-per-test transaction). Migration `f6a7b8c9d0e1`
(`revises e5f6a7b8c9d0`); `upgrade` re-runs `seed_rbac` (adds `ai.use`),
`downgrade` drops both tables and leaves the additive permission row.

- **Strict ownership.** `get_owned_conversation()` returns `None` for a
  non-owner; the route turns that into `404` (never `403`, never another user's
  data). Administrator status grants nothing here.
- **Real delete.** `DELETE` issues `DELETE` statements - private AI history is not
  routed through the operational Trash module. Documented, intentional.
- **Titles** come from `derive_title(first_user_message)` - deterministic
  (strip punctuation, truncate on a word boundary, capitalise); **no LLM call**.

### Tool layer (`tools.py`) - the security boundary

A frozen `REGISTRY: dict[str, Tool]` of **10** read-only tools. Each `Tool` has a
name, a description, **one required `permission`**, a Pydantic `input_model`
(`extra="forbid"`, every field bounded), and a `run(db, params)` that reuses the
existing domain services and returns a `ToolResult` (data + one `AIEvidenceItem` +
`AIEntityRef`s). Serialisers are **whitelists** (`_asset_dict` / `_incident_dict`
emit id / name / type / environment / criticality / status / owner … and *never*
a user, hash, token or secret field).

| Tools | Permission |
| --- | --- |
| `search_assets`, `get_asset`, `summarize_assets`, `get_dashboard_overview` | `assets.read` |
| `search_incidents`, `get_incident`, `summarize_incidents`, `get_incident_timeline` | `incidents.read` |
| `search_audit`, `get_audit_event` | `audit.read` |

`ToolExecutor(db, permissions)`:

- `available()` / `can(name)` - filter by the caller's effective permissions.
- `call(name, params)` - `UnknownToolError` for an unknown name;
  **`ToolPermissionError` if `tool.permission not in permissions`** (checked in
  Python, *before* `run`, regardless of anything a user message said);
  `ToolInputError` on schema violation; then `run`. Results are collected for
  evidence / entity aggregation.

There is **no** arbitrary-SQL tool, no raw-query tool, no generic HTTP / shell /
filesystem tool, and no mutation tool - asserted by
`tests/unit/test_ai_tools.py::test_every_tool_is_read_only_and_permission_gated`.

### Orchestrator (`run_turn`)

authenticate → `require_permission("ai.use")` → load **owned** conversation →
resolve context (permission + liveness) → **sweep a dangling user turn** (see
below) → **persist the user message, set the title, `commit`** → build the
bounded history window → `provider.generate(request)` with a `ToolExecutor` → on
success persist the assistant message + sanitised metadata and `commit`; on
`ProviderTimeout` / `ProviderUnavailable` / `ProviderUnsupported` / `ToolError` →
`db.rollback()` and raise a typed `AIError` (the route maps it to
`503 {detail:{code,message}}`). The DB write transaction is **not** held open
across the provider call, and a provider failure never fabricates a successful
assistant turn - the user message stays for retry.

**Dangling-turn sweep.** A failed turn leaves its user message with no assistant
reply. When the *next* turn starts, if the last stored message is an unanswered
`user` message the orchestrator removes it (`conv_service.remove_message`) before
appending the new one - so a **retry regenerates that turn** instead of stacking
a second identical user message. The normal flow never otherwise leaves a
trailing user message, so the sweep only ever touches a genuinely dangling turn.

### Providers

`AI_PROVIDER` (`deterministic` | `openai`), `AI_MODEL`, `AI_API_KEY`,
`AI_OPENAI_BASE_URL`, `AI_REQUEST_TIMEOUT_SECONDS`. **Keys are backend-only.**
`get_provider()` is `lru_cache`d.

- **`DeterministicProvider`** (default) - `ready` always `True`, **no API key**.
  Normalises the message (strip accents, lowercase), matches a documented intent
  (asset/incident summary · search · critical · inactive; open / critical
  incidents; asset↔incident relationship; recent audit changes; context-scoped
  asset/incident questions), runs the **real** tools against the **real** DB, and
  returns a grounded Spanish answer. It also answers a small **product/help
  intent** - *"¿Qué es InfraGuard AI?"* / *"¿Qué puedes hacer?"* /
  *"¿En qué me puedes ayudar?"* and Spanish variants - with a static description
  of the platform and a capability list **scoped to the caller's permissions**
  (`ex.can(tool)`, not a second copy of RBAC); this answer carries **no
  evidence / entities** because it is not a data lookup. Anything outside every
  intent → *"Esta consulta requiere un proveedor de IA avanzado…"*. A
  `ToolPermissionError` → *"No tienes permiso para consultar {la Auditoría}…"*.
  It never invents an entity or a fact.
- **`OpenAIProvider`** (optional) - stdlib `urllib` (no new runtime dep), tool
  schemas from each `input_model`, a bounded tool-call loop, `SYSTEM_BOUNDARY`
  system prompt, `ProviderTimeout` / `ProviderUnavailable` on transport error.
  `ready = bool(api_key)`; if not ready the Assistant degrades gracefully and the
  rest of InfraGuard is unaffected.

### Prompt / tool-injection posture

User messages are untrusted. Enforcement is in code: the executor authorises
every tool call by permission set; the whitelist serialisers bound what leaves
the DB; the route never serialises secrets, hashes, tokens, env vars, SQL or
stack traces. `SYSTEM_BOUNDARY` additionally *instructs* the model to refuse
rule-breaking requests, but the guarantee is the backend, not the prompt.
`tests/integration/test_ai_rbac.py` covers "a Viewer cannot obtain Audit data via
AI".

### Rate limiting & auditing

A dedicated `RateLimiter(AI_RATE_LIMIT_MAX_MESSAGES, AI_RATE_LIMIT_WINDOW_SECONDS)`
keyed `ai-message:{user_id}` - stricter than ordinary reads, typed `429` +
`Retry-After`, `reset_ai_rate_limiter()` for deterministic tests. **AI activity
writes no audit events in v1** (nothing to correlate for a read-only feature;
conversation content is already owner-visible; direct reads are not audited
either) - revisit with the action layer.

## Asset Relationships & Topology

`app/models/relationship.py` + `app/schemas/{relationship,topology}.py` +
`app/services/{relationships,topology}.py` + `app/services/graph/` +
`app/api/v1/routes/{relationships,topology}.py`. Users model real dependencies
between Assets (`prod-api-01 depends_on prod-db-primary`), manage them, and
explore the result as a graph. **PostgreSQL is canonical for everything,
including relationships. Neo4j is an optional, backend-only, derived
projection - never the system of record, and never reachable from the
frontend.**

### Taxonomy + data model

`RelationshipType(enum.StrEnum)` - `depends_on` / `hosts` / `connects_to` /
`uses` / `provides_service_to` / `member_of` - each described once in
`RELATIONSHIP_TYPE_CATALOG` (code, Spanish label, inverse label, description,
category, and whether/how it **propagates impact**), mirrored exactly by the
frontend's `relationships.types.*` i18n keys and served over
`GET /relationships/types` so the two never drift. **Direction is explicit and
generalized from `depends_on`**: for any edge `A → B`, `B` is *upstream* of
`A` and `A` is *downstream* of `B`. All six types are stored **directed**
internally (even the symmetric-feeling `connects_to`) - a deliberate v1
simplicity choice, so `A→B` and `B→A` are both valid, distinct edges.

`AssetRelationship` (table `asset_relationships`): UUID PK, `source_asset_id`
/ `target_asset_id` (FK `assets.id`, `CASCADE` - documented as only firing on
a hard delete InfraGuard never performs), `relationship_type`, nullable
`description`, `created_by` (FK `users.id`, `ON DELETE SET NULL`),
timestamps. `CHECK` constraints reject a self-link
(`relationship_no_self_link`) and an unknown type; a
`UniqueConstraint(source_asset_id, target_asset_id, relationship_type)`
rejects an exact duplicate edge (`409`) - the reverse direction is a distinct,
valid row. **The relationship's UUID is its identity** - nothing is ever
looked up by source+target *names*, so renaming an Asset cannot break a graph
edge.

Migration `a7b8c9d0e1f2` (revises `f6a7b8c9d0e1`) creates the table and also
**widens the `audit_events.entity_type` CHECK constraint** to add
`"Relationship"` - the original audit migration's vocabulary predates this
entity type. If you are adding another new `AuditEntityType` in a future
migration, check whether that CHECK needs the same treatment; it will not
surface until a route actually tries to write that entity type (only caught
in this milestone via a live `seed-demo` run, not `alembic check`).

### Soft-delete interaction (`both_endpoints_live()`)

Trashing an Asset does **not** cascade-delete its relationships - the rows
stay in PostgreSQL. Every normal relationship/topology query filters through
`both_endpoints_live()` (`Source.deleted_at IS NULL AND Target.deleted_at IS
NULL`, aliased `Asset` joins) at **read time**, so a trashed Asset's edges
simply disappear from the live view without any explicit "hide" step, and
restoring the Asset makes them reappear automatically - zero reactivation
code, zero lost history. Assets routes call `graph_sync.upsert_asset()` after
every create / update / trash / restore / reactivate so the Neo4j node's
`trashed` flag - and thus the graph view - tracks the same state.

### RBAC

`relationships.read` / `relationships.manage` - two **distinct** new
permissions (catalog now **19**) rather than folding this into
`assets.manage`, because topology is its own capability that will keep
growing (impact analysis today, more AI graph tools tomorrow). Matrix:
Administrator (both), Operator (both), Analyst (read), Viewer (read) - the
topology *query* API additionally requires `assets.read` (enforced as **two**
stacked `require_permission` route dependencies).

### Mutation semantics

`create_relationship()` validates in order: source exists & is live, target
exists & is live, source ≠ target, known type, no duplicate edge, then inserts
- one transaction, audit `CREATE` emitted only after a successful commit.
`update_relationship()`'s schema (`RelationshipUpdate`) has **no** source/target
fields at all (`extra="forbid"`, not just ignored) - moving an edge is
delete-old + create-new by design. `delete_relationship()` issues a real
`DELETE` - edges are **not** modeled in Trash (Trash represents operational
entities; an edge is metadata about two entities, and its own identity/audit
trail is sufficient history). Every mutation calls `graph_sync.upsert_edge` /
`remove_edge` **after** `db.commit()` - the PostgreSQL write is never rolled
back because Neo4j is slow or down (see *Neo4j projection* below); a
`relationship_type` change on `PATCH` removes the old-typed Cypher edge before
upserting the new one, since Cypher relationship types are immutable.

### Topology query engine (`app/services/topology.py`) - **PostgreSQL, not Neo4j**

`/topology/subgraph`, `/topology/assets/{id}/impact` and `/topology/path` are
answered by a **bounded, iterative breadth-first search directly against
`asset_relationships`** - a deliberate v1 design choice, not an oversight.
Keeping graph *reads* on the same engine as every other read means there is
one source of truth, no read-your-writes lag, and **Neo4j being unavailable
never affects topology correctness** - it only affects `GET /topology/health`
and future graph-native features. Neo4j remains a real, separately-tested,
eventually-consistent projection (see below) used for sync/health and future
graph-native querying; it is deliberately not yet on this read path.

- **`get_subgraph()`** - BFS from `root_asset_id`, `depth` (default 1, max 3),
  `direction` (`both` / `upstream` = outgoing / `downstream` = incoming),
  filters (`relationship_type`, `environment`, `criticality`, `status`), a
  `node_cap` (default 200, max 500) with an honest `truncated: true` flag
  rather than silently dropping data, and cross-links between already-known
  nodes are still included (not just tree edges).
- **`compute_impact()`** - walks only the **propagating** subset of
  relationship types, in the type-specific direction:
  `PROPAGATING_RELATIONSHIP_TYPES` + `impact_direction` on each catalog entry
  (`depends_on` / `uses` → `"reverse"`, i.e. the *target's* failure impacts the
  *source*; `hosts` / `provides_service_to` → `"forward"`). `connects_to` /
  `member_of` never propagate - informational only. A `visited: dict[id,
  distance]` makes a cycle (`A→B→C→A`) terminate naturally instead of
  looping.
- **`find_path()`** - undirected shortest-path BFS (a dependency path is
  meaningful regardless of the edges' direction), bounded by `max_depth`, a
  `visited` set again preventing infinite loops on a cycle, path reconstructed
  via parent pointers.

### Neo4j projection (`app/services/graph/`)

`client.py` - `configured()` (true iff `NEO4J_URI` is set), a **lazily
imported** `neo4j` driver (`import neo4j` happens inside `_build_driver()`,
so the package is not a hard import-time dependency of the backend),
`lru_cache`d driver, a `run()` that always uses **parameterized** Cypher and
converts any transport error into a single `GraphUnavailable` exception, and
`check_health()` which **never raises** - it returns a typed status instead.

`sync.py` - `upsert_asset` / `remove_asset` / `upsert_edge` / `remove_edge` /
`full_rebuild(db)`. Every function checks `configured()` first (no-op if
unset) and swallows `GraphUnavailable` with a logged warning - **a Neo4j
failure is never raised into the caller**, which has already committed the
PostgreSQL mutation. Node shape:
`(:Asset {id, name, asset_type, environment, criticality, status, is_active,
trashed})` - trashed Assets are **flagged**, not removed, so a restore is a
simple re-upsert rather than recreating the node and all its edges. Edge
Cypher type is drawn **only** from a fixed allow-list dict (`relationship_type
.upper()`, e.g. `DEPENDS_ON`) - **never** built from unvalidated input - and
carries a `relationship_id` property (the canonical PostgreSQL UUID) so it can
be found/removed by identity, never by re-deriving it from source/target
names.

`full_rebuild(db)` (invoked by `python -m app.scripts.sync_topology` /
`docker compose run --rm sync-topology`) reads every live Asset + canonical
relationship, upserts current nodes/edges, then **prunes only** `:Asset`
nodes and allow-listed-relationship-type edges that no longer exist in
PostgreSQL (chunked deletes of 500) - it never touches other graph data that
might coexist in the same Neo4j database. It is idempotent and safe to run
repeatedly; it is **not** run automatically by `docker compose up`.

### Consistency & failure model

PostgreSQL commit **always** happens first and is authoritative; the Neo4j
sync is a **best-effort side effect attempted after** that commit. A Neo4j
outage or slowness **never** rolls back, blocks, or fails an Asset/relationship
mutation - it only means the projection is briefly stale until the next
mutation (which retries the same upsert) or an explicit `sync-topology` full
rebuild. This is why the topology *query* path deliberately stays on
PostgreSQL (above): the "eventually" in "eventually consistent" never has a
chance to produce an incorrect *read*, only a stale *Neo4j-specific* one.
Sync failures are logged, never written to the Audit log (nothing a user did
wrong - see `app/services/audit.py`'s scope) and never surfaced as a `5xx` to
the caller.

### Health & degradation

`GET /topology/health` calls `graph_client.check_health()` and **always**
returns `200` - it is diagnostic, never a liveness/readiness gate, and it
never makes the rest of the platform (or even the rest of the topology API)
report unhealthy. Status is one of `not_configured` (`NEO4J_URI` unset),
`unavailable` (configured but unreachable/erroring), or `operational`. With
Neo4j stopped or unset: relationship CRUD, the asset-scoped grouped read, and
every `/topology/*` query endpoint **keep working unchanged** (they run on
PostgreSQL) - only `health` reports the degraded state, for the frontend to
show "Topología no disponible temporalmente" if it chooses to surface it.

### AI Assistant integration

Three new **read-only** tools extend the existing allow-listed registry - no
new architecture, no write actions: `get_asset_relationships`,
`get_asset_neighbors`, `get_asset_impact`. Each declares
`permission="relationships.read"` **and** `extra_permissions=("assets.read",)`
- `Tool.required_permissions()` and `ToolExecutor.available()/can()/call()`
were extended to check **all** required permissions, not just one, so a
caller needs both to see or invoke a graph tool. This enables grounded
answers like *"¿De qué depende prod-api-01?"* or *"¿Qué podría verse afectado
si falla prod-db-primary?"* while keeping the same permission-enforced,
no-mutation, no-raw-Cypher security boundary as every other tool.

## Authentication

### User model

`app/models/user.py` - `id` (UUID PK, DB-generated), `email` (**UNIQUE** on the
normalized value, lowercased + non-empty via CHECK constraints),
`password_hash`, `account_status` (`pending` / `active` / `rejected` /
`disabled`, CHECK-constrained, `server_default 'pending'`), `created_at` /
`updated_at` (timezone-aware). `is_active` is a read-only `@property`
(`account_status == "active"`) - there is no `is_active` column. Roles live in
the RBAC tables (Phase 3).

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

### Duplicate registration

`register` returns a **status-neutral** `409` -
`"An account or access request already exists for this email."` - identical
whether the email belongs to a `pending`, `active`, `rejected` or `disabled`
account (never reveal which). Enforced twice: a `get_by_email` pre-check in
`create_user`, and the `users.email` UNIQUE constraint on the normalized value
(an `IntegrityError` is caught and re-raised as the same `409`). This still
allows existence enumeration - kept deliberately for portfolio usability, blunted
by rate limiting; production would use a generic response + out-of-band email
confirmation. See `docs/architecture.md` §12.14.

### Rate limiting

Best-effort in-process fixed-window limiter (`app/core/ratelimit.py`) on
`login` and `register` - `AUTH_RATE_LIMIT_MAX_ATTEMPTS` per
`AUTH_RATE_LIMIT_WINDOW_SECONDS` per client IP. **Per-process and lost on
restart** - production needs a shared store (Redis) or gateway/WAF rate
limiting. No Redis is added for v0.2.

## Database safety

The developer's `infraguard-ai_pgdata` **and** `infraguard-ai_neo4j_data`
volumes are **persistent user data**. Neither is ever dropped / truncated /
reset / `down -v`'d as part of testing - Neo4j only ever holds a *derived*
projection, but losing it still means a manual `sync-topology` rebuild, so it
gets the same protection as `pgdata`. Two things protect them:

* **Isolation** - destructive work (the integration suite; `upgrade` /
  `downgrade` cycles) runs against the throwaway `db-test` Compose service
  (`--profile test`, separate `pgdata_test` volume, `127.0.0.1:55433`), never the
  main `db`.
* **A fail-closed guard** (`app/core/db_safety.py`) - a destructive helper /
  `tests/dbguard.py` refuses unless **both** `INFRAGUARD_DISPOSABLE_DB` is set
  truthy **and** the target database name is disposable (`test` / `*_test`, and
  not the app's own `DATABASE_URL`). A naming convention alone is not trusted.

Regenerate demo data with the seed command below, never by resetting PostgreSQL.

## Demo seed (`app/seeds/`, `python -m app.scripts.seed_demo`)

Loads the curated demo dataset (~70 assets, ~30 incidents, incident↔asset
relationships, **~88 asset-to-asset relationships** across the 6 taxonomy
types forming realistic clusters - edge/LB/web/API/db/cache/mq tiers,
identity, Kubernetes, storage/backup, monitoring - never a random full-mesh,
backdated timelines, audit history, a little Trash, 3 pending access
requests). `app/seeds/relationships.py` holds `RELATIONSHIP_SPECS` - the seed
itself only writes PostgreSQL; project it into Neo4j afterwards with
`docker compose run --rm sync-topology` (optional).

* **Additive + idempotent** - every demo row has a deterministic id
  (`seed_uuid(kind, key)`, uuid5 over a fixed namespace). An existing id ⇒
  skipped. It issues no `DROP` / `TRUNCATE` / `DELETE`, never updates a row it
  did not create, and never touches users' passwords, statuses or roles or the
  audit history. Re-running produces zero new rows.
* **Non-destructive ⇒ no disposable opt-in** - it is meant to run against the
  normal dev database. The caller owns the transaction (one `commit` in the CLI);
  a failure rolls the whole seed back.
* **Audit** - events are written through `record_event` with a dedicated
  `AuditContext` (actor = the earliest active Administrator; `request_id`
  prefixed `seed-demo`). No Administrator ⇒ `SeedError` telling you to run
  `bootstrap` first (never silently creates one).
* **Data** lives in `app/seeds/assets.py` / `incidents.py`; `runner.py`
  orchestrates; `timeline.py` builds well-formed backdated `IncidentEvent`s that
  satisfy the same invariants the request-path service enforces. This is **not**
  a test fixture.

## Migration workflow

```bash
# Local (host), against the THROWAWAY db-test (never the main db):
docker compose --profile test up -d db-test
export INFRAGUARD_DISPOSABLE_DB=1
export DATABASE_URL=postgresql+psycopg://infraguard:infraguard_test_only@localhost:55433/infraguard_test
alembic upgrade head           # apply
alembic downgrade -1           # roll back one
alembic revision --autogenerate -m "add <table>"   # after model changes

# Apply migrations to the real dev database (one-shot, never runs on `up`):
docker compose run --rm migrate
```

`alembic/env.py` imports `app.db.registry` (which imports every model) so
autogenerate sees the full metadata. The DB URL comes from `app.core.config` -
never duplicated into Alembic files. Nine migrations so far: `users` → `assets` →
`incidents` (+ `incident_assets` / `incident_events`) → `audit_events` /
`audit_changes` → `c3d4e5f6a7b8` *add soft delete* → `d4e5f6a7b8c9` *add RBAC:
roles, permissions, user_roles, role_permissions* (**seeds** the catalog + system
roles via `app.services.rbac.seed_rbac` and heals a pre-RBAC install) →
`e5f6a7b8c9d0` *account lifecycle* → `f6a7b8c9d0e1` *add AI Assistant:
`ai_conversations` / `ai_messages` + re-seed `ai.use`* → `a7b8c9d0e1f2` *add
`asset_relationships` (+ widens the `audit_events.entity_type` CHECK to admit
`"Relationship"` - see Asset Relationships & Topology above)*. Each was
hand-reviewed and validated on the Docker PostgreSQL
(`upgrade → check → downgrade → upgrade`, no model/DB drift).

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

Governance Phase 3 keys: `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` -
read **only** by `python -m app.scripts.bootstrap_admin` (and the
`docker compose run --rm bootstrap` one-shot). Both unset by default; the command
fails safely (exit 1) when either is missing. Never consumed at app startup, so
an unconfigured deployment simply has no bootstrap admin until the command is
run.

AI Assistant keys: `AI_PROVIDER` (`deterministic` default | `openai`), `AI_MODEL`,
`AI_API_KEY` (**backend only** - never a `NEXT_PUBLIC_*`; unset ⇒ a real provider
reports "not ready" and the Assistant degrades gracefully), `AI_OPENAI_BASE_URL`,
`AI_REQUEST_TIMEOUT_SECONDS` (`0 < t <= 120`), `AI_MESSAGE_MAX_LENGTH`,
`AI_MAX_TOOL_RESULTS`, `AI_HISTORY_WINDOW`, `AI_RATE_LIMIT_MAX_MESSAGES` /
`AI_RATE_LIMIT_WINDOW_SECONDS`. **No key is required for tests, Docker, CI or a
normal startup** - the default provider uses the real database, not an external
model.

Asset Relationships & Topology keys: `NEO4J_URI` (unset by default outside
Docker Compose - `configured()` is `False`, and the backend, relationship
CRUD and the topology API all work identically without it),
`NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` (**backend only** -
never a `NEXT_PUBLIC_*`), `NEO4J_TIMEOUT_SECONDS` (`0 < t <= 60`, default 5).
**No Neo4j instance is required to run the backend test suite** - unit tests
mock the graph client entirely, and the integration suite exercises the
topology query API against PostgreSQL only.

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
  config fail-safety, Argon2 + JWT (incl. the **30-minute default lifetime**),
  password policy / schema serialization, the rate limiter, health-endpoint
  behaviour, **the 422 no-reflection guard**, **the no-store header rule**, **the
  test-DB safety guard**, the **asset schema validation**, the **RBAC catalog**
  (`test_rbac_catalog.py`: **19** codes incl. `ai.use` / `relationships.read` /
  `relationships.manage`, Administrator = all, every system role can use AI,
  role matrix), the **AI tool + deterministic-provider contract**, that
  **every asset / admin / ai / relationships / topology endpoint rejects an
  unauthenticated request** first, the **relationship taxonomy**
  (`test_relationship_taxonomy.py` - every enum member cataloged, every
  propagating type has a direction, non-propagating types excluded), and the
  **Neo4j sync layer** (`test_graph_sync.py` - a fully mocked `client.run` /
  `configured`, **no real Neo4j required**: no-op when unconfigured, allow-listed
  Cypher types, `GraphUnavailable` swallowed not raised, `full_rebuild`
  upserts + prunes only stale rows, `check_health` for all three states).
* **Integration** (`tests/integration/`) - each test runs in a transaction that
  is rolled back; the session-scoped fixture seeds the RBAC catalog once
  (committed). Exercises register / login / `me` / logout, the full asset /
  incident lifecycle, **Trash / restore** (`test_trash_api.py`), and **RBAC**:
  - `test_rbac_permissions.py` - a parametrized **permission matrix**: for every
    protected operation, unauthenticated → `401`, missing permission → `403`,
    holder → success.
  - `test_rbac_roles.py` / `test_rbac_users.py` - system-role seed, custom-role
    CRUD (+ system immutability, delete-while-assigned `409`), user list /
    `status` filter / detail, enable / disable, role assignment,
    effective-permission union, disabled-user rejection.
  - `test_rbac_lockout.py` - the last active Administrator cannot deactivate
    themselves or lose the role; with a second admin they can; a blocked mutation
    leaves authorization + the audit log untouched.
  - `test_rbac_bootstrap.py` - registration → `pending` / no roles / cannot
    authenticate; stale roles on a non-active account grant nothing;
    `ensure_bootstrap_admin` creates an active Administrator, is idempotent (no
    duplicate, no password reset), promotes an existing account, normalizes the
    email, rejects a missing / weak / invalid config; the CLI never prints the
    password and exits non-zero on a missing config.
  - `test_auth_api.py` - registration is a `pending` access request;
    duplicate / different-case / whitespace registration is `409`; DB uniqueness
    holds when the service is bypassed; `pending` / `rejected` / `disabled` login
    each return the right `403` code; a wrong password stays a generic `401`.
  - `test_rbac_audit.py` - user / role changes are audited (`CREATE` on
    registration, `STATUS_CHANGED` field = `account_status`); a failed mutation
    writes **no** event; no secrets leak.
  - `test_relationships_api.py` - create + grouped read + delete; self-link
    `422`; duplicate edge `409` (reverse direction allowed); unknown type
    `422`; missing/trashed asset `404`/`409`; **soft-delete preserves the
    canonical row and restore reactivates the live topology** (the key
    round-trip test); `PATCH` rejects `source_asset_id` (`422`, schema-level);
    update-to-duplicate `409`; audit `CREATE`/`UPDATE`/`DELETE`; RBAC
    (`relationships.read` vs `.manage`); the type catalog endpoint;
    asset-scoped direction/environment filters.
  - `test_topology_api.py` - subgraph at depth 0/1/2/max; direction
    upstream/downstream; relationship-type/environment/criticality filters;
    node-cap truncation; excludes a trashed asset; missing/trashed root →
    `404`; impact propagates through `depends_on` but not `connects_to`;
    impact respects `max_depth`; **a cycle (`A→B→C→A`) does not infinite-loop**
    (asserted directly); path found/not-found; topology RBAC requires **both**
    `relationships.read` and `assets.read`; `GET /topology/health` never
    fails.
  - `test_seed_demo.py` - first run creates ~70 assets / ~30 incidents; second
    run is a no-op (no duplicates); hand-made records and existing users
    (password hash, status, roles) survive; relationships have no orphans;
    trashed rows are excluded from normal lists but present in Trash; the
    Dashboard summaries reflect the seed; both lists span multiple pages; the
    seed raises `SeedError` (writing nothing) when no active Administrator
    exists.
  - **AI Assistant** - `test_ai_conversations.py` (create / list-own-only /
    get-own / cross-user `404` / delete / pagination + `updated_at DESC` order /
    deterministic bounded title), `test_ai_chat.py` (both turns persisted,
    `updated_at` advances, max length, empty rejected, missing conversation,
    ownership), `test_ai_rbac.py` (**no `ai.use` → denied**; `ai.use` +
    `assets.read` → asset tool works; `ai.use` **without** `audit.read` → an
    Audit question yields *no audit data*; no bypass), `test_ai_context.py`
    (context re-fetched + permission/liveness enforced; a tampered id grants
    nothing), `test_ai_failure.py` (provider failure / tool failure → typed
    `503`, user message kept; **retry after failure sweeps the dangling turn -
    no duplicate user message**), plus `tests/unit/test_ai_tools.py` (input
    validation, bounded sizes, **every tool read-only + permission-gated**) and
    `tests/unit/test_ai_provider_deterministic.py` (grounded known query,
    general knowledge → "requiere un proveedor de IA avanzado", **product/help
    intent answered without a provider and scoped to permissions, with no
    fabricated evidence**, never fabricates an entity, missing entity handled).

  `auth_client` is a logged-in **Administrator** - the fixture registers, then
  activates + assigns the role directly on the test session (the equivalent of an
  approval). `make_client` does the same for scoped sessions
  (`roles=["viewer"]`, `roles=[]`, …).

### Integration test database safety (`tests/dbguard.py` + `app/core/db_safety.py`)

* **`TEST_DATABASE_URL` unset** → integration tests **skip**.
* **`TEST_DATABASE_URL` set** → it must pass the guard *and* be reachable, or the
  suite **fails** (never silently skips - important in CI). The guard is
  **fail-closed** and needs *both*:
  * **`INFRAGUARD_DISPOSABLE_DB` set truthy** (`1` / `true` / `yes` / `on`) - an
    explicit "this target is throwaway" opt-in; and
  * a **disposable name** - `test` or ending `_test` (case-insensitive), and not
    equal to the application's own `DATABASE_URL` database.
* Only then does the fixture run `drop_all` / `create_all`. Point it at the
  Compose `db-test` service (`127.0.0.1:55433`); a naming convention alone is
  never trusted, and there is no `--force`.
* `test_db_safety.py` / `test_dbguard.py` verify the guard: main-DB URL →
  refused; disposable name without the opt-in → refused; both present → allowed.

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
