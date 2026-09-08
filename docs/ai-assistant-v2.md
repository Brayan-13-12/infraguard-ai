# AI Assistant v2

V2 extends the v1 conversation UI, persistence and deterministic provider with the
official OpenAI Python SDK (3.8.0), Responses function calling and HTTP SSE.
Operational data remains read-only. PostgreSQL relationships remain canonical;
Neo4j remains a derived projection. No migration is required.

## Milestone validation status

Live OpenAI validation was intentionally deferred for this milestone: no paid API
usage or OpenAI credential was configured for validation. This external-provider
validation is not a blocker for closing AI Assistant v2. The official OpenAI provider
is implemented and remains available for later activation through backend-only
configuration and an API credential, without redesigning AI v2.

Local, offline and CI validation uses the deterministic provider, together with
offline SDK transcripts for the OpenAI adapter. These checks validate the integration
contracts; live model behavior and answer quality can be evaluated later using the
manual provider checklist below. Deterministic mode remains the default and makes
no paid provider requests.

## Configuration and local setup

The default is `AI_PROVIDER=deterministic`; no external credential is needed.
To enable OpenAI, edit your ignored root `.env` locally:

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=
AI_OPENAI_BASE_URL=https://api.openai.com/v1
AI_REQUEST_TIMEOUT_SECONDS=30
AI_MAX_TOOL_ROUNDS=6
AI_MAX_OUTPUT_TOKENS=2000
AI_HISTORY_WINDOW=20
AI_MAX_TOOL_RESULTS=25
```

Supply your own key privately in `AI_API_KEY` and choose a Responses/function-capable
model available to your account. Then run `docker compose up -d --build backend`.
The Compose backend environment forwards these values; they are never frontend
build arguments. Do not print resolved Compose configuration when secrets are set.
Do not put keys in frontend environment files, fixtures or source control.
An empty key in OpenAI mode produces `provider_not_configured` when sending a turn;
startup and platform health still work. Switching providers is explicit: failures
never silently fall back to deterministic answers.

`GET /api/v1/ai/capabilities` requires `ai.use` and returns provider, model, ready,
configured, streaming, tool_calling, read_only, message limit and tool availability.
Availability includes all required permissions. No key, base URL or headers are returned.
Streaming describes the InfraGuard transport: deterministic mode emits one completed
text chunk; OpenAI emits actual SDK text deltas.

## Provider and execution boundaries

`AIProvider.generate()` remains compatible. `stream()` yields provider-neutral
events and a final `ProviderResult`; the default implementation adapts deterministic
and fake providers. OpenAI SDK types stay in `providers/openai.py`.

The adapter sends only `ToolExecutor.available()` function definitions. Strict
JSON schemas preserve Pydantic `$defs`, UUID formats, enums and numeric/string
bounds, forbid additional properties and require every provider-facing property.
The executor independently validates permissions and arguments on every call.
Invalid JSON is an error result, never silently replaced by an empty search.

| Tools | Required permissions |
| --- | --- |
| search_assets, get_asset, summarize_assets, get_dashboard_overview | assets.read |
| search_incidents, get_incident, summarize_incidents, get_incident_timeline | incidents.read |
| search_audit, get_audit_event | audit.read |
| get_asset_relationships, get_asset_neighbors, get_asset_impact, find_dependency_path | relationships.read AND assets.read |

Asset incident counts are queried only with `incidents.read`. Incident asset
details/cards require `assets.read`. Related incidents are composed through the
existing `search_incidents(asset_id=...)`, avoiding redundant specialized tools.
Comparisons, incident investigations and operational-risk analysis compose these
primitives. Rankings must explain their criteria; no official risk score is invented.

The system instruction separates general knowledge from current InfraGuard facts:
general knowledge may be answered without tools; infrastructure facts require tool
reads. It asks for the user's language and distinguishes observations from analysis
and recommendations. Descriptions, names, notes, timelines, audit values and user
messages are untrusted data. Entity context is a user-role type/ID hint, never a
system message; the provider must retrieve facts through tools. Prompting is guidance,
not the permission enforcement mechanism. No SQL, Cypher, shell, filesystem, arbitrary
HTTP, web retrieval or mutation tool exists.

## Bounds, history and observability

Default limits: 6 tool rounds, 8 calls per round, 2,000 output tokens per provider
request, 20 history messages (4,000 characters each), 25 search results (configurable
up to 50), 24,000 characters per tool result, 160,000 characters of accumulated
provider context and 20,000 answer characters per turn. Tool argument JSON is limited
to 8,000 characters. The executor also caps successful calls at 64. Results remain
valid JSON; long values/list boundaries are marked truncated. Oversized results fail
closed, inviting a narrower query instead of supplying invalid JSON.

Neighborhood reads use 1–2 hops and 40 nodes; impact uses at most 3 hops and 40 nodes.
Connection paths use at most 3 hops, 500 visited nodes and 2,000 candidate edges per
hop. They retain the recorded edge directions. A connection path can traverse either
direction and does not imply a propagating dependency. Missing/truncated paths are
explicit. No Neo4j driver or projection changes are part of v2.

Provider requests disable SDK automatic retries and response storage (`store=False`).
The adapter checks a wall-clock deadline between SDK events and tool calls and passes
the remaining time as the HTTP timeout (maximum setting 120 seconds). A synchronous
blocked socket can take its read timeout to unwind; this is not a hard OS-level task
kill. Calls in one provider round execute sequentially on the same SQLAlchemy session;
the provider can request multiple functions without unsafe concurrent session use.

Conversation follow-ups use persisted bounded history and the context ID. Assistant
history includes a permission snapshot; after a permission reduction, unavailable
answers are omitted from provider history and history reads. Legacy answers without
snapshots require all four read domains to be visible. This conservative rule can
hide old answers; it prevents an old assistant answer from becoming a permission bypass.

Safe logs record turn start, provider name, tool family, completion, duration and typed
failure code. Persisted metadata includes provider/model, duration, tool count, source
families, permissions and reply identity. Raw tool payloads, provider payloads, hidden
reasoning and secrets are neither logged nor stored. Transient SDK continuation items
remain adapter-local. AI prompts do not create operational Audit events.

## Streaming and retry contract

`POST /api/v1/ai/conversations/{id}/messages/stream` uses authenticated fetch SSE,
with the same `ai.use`, origin, ownership and per-user rate limiter as the JSON endpoint.
Body: `{ "content": "...", "request_id": "UUID" }`. The JSON messages endpoint
accepts the same optional request ID and remains supported.

| Event | Data |
| --- | --- |
| turn.started | user_message: persisted canonical user message |
| tool.started | source: authorized domain family |
| tool.completed | source, success |
| text.delta | delta: visible answer text only |
| turn.completed | original ChatResponse: conversation_id, title, user_message, assistant_message |
| turn.failed | code, safe message |

Tool arguments, raw tool JSON, SDK events and private reasoning are never streamed.
`turn.completed` is emitted after the assistant commit. The frontend only accepts
success after this event, regardless of how much text arrived. Its incremental parser
handles split UTF-8, arbitrary chunk boundaries, CRLF, unknown events and disconnects.

Persistence: commit user first, then generate, then commit a complete assistant.
Failure/closed generation stores no partial assistant. A retry reuses the user request
identity, and a completed request replays the same canonical pair without another
provider call. A different request ID creates a distinct turn even for identical text.
Legacy clients retain the v1 dangling-user sweep. Unanswered older requests superseded
by another user turn cannot be replayed. Request IDs are scoped to the owned conversation.

One active turn per user per process prevents double-submit, concurrent retry and
deletion during generation. The existing rate limit remains 20 messages per 60 seconds.
Multiple server workers/replicas need a shared lock/idempotency constraint before using
this guarantee across processes. The current Compose deployment uses one process.

The async response iterator drives the synchronous provider in a worker and shields
cleanup on disconnect. Cleanup closes the SDK stream, session and turn slot. If the
server completed just before disconnect, retry replays that completion. No Stop button
is presented: immediate upstream cancellation is not guaranteed during a blocked
synchronous SDK read. The browser transport has a 150-second timeout. Navigation through
the conversation rail is guarded while generating to prevent cross-thread UI updates.

Typed errors include provider_not_configured, provider_authentication_error,
provider_rate_limited, provider_timeout, provider_unavailable, tool_execution_failed,
tool_round_limit_exceeded and turn_in_progress. Pre-stream authentication, ownership,
validation and rate failures use HTTP status codes. Generation failures use turn.failed.

## Evidence and UI

Evidence and entity cards come exclusively from successfully executed tool results;
model-generated IDs are never accepted. Evidence retains source/label/count, and cards
link through existing Asset, Incident and Audit workspaces. Source activity is compact,
and completed execution summaries are collapsed. Permission-aware backend suggestions
and frontend context/global prompts avoid recommending inaccessible domains.

The existing rail/mobile drawer, composer and context chip remain. Topology's selected
asset inspector now offers the existing Ask AI entry point. Markdown supports paragraphs,
bold, bullets, numbered lists and inline code using React text nodes. HTML, images and
arbitrary links remain inert, including during incomplete streaming syntax. Tables and
a full embedded graph are outside this renderer's scope.

Streaming text has wrapping bounds and does not take keyboard focus. Tool status uses
a small live region; token deltas are not individually announced. Enter sends and
Shift+Enter adds a newline. Test desktop widths 1920/1440/1024, tablet 768 and mobile 390,
both themes, long content, context, retry and the history drawer before release.

## Validation and manual provider questions

Automated tests require no paid key. `test_ai_provider_openai.py` uses SDK transcripts;
`test_ai_v2.py` exercises login fixtures, real PostgreSQL tools, RBAC, graph evidence,
stream persistence and replay. Standard CI runs these with `AI_PROVIDER=deterministic`.
Use the explicitly disposable `db-test` service and the existing database guard for
integration tests. No migrations or developer-volume resets are required.

With a privately configured real provider, ask these questions in order:

1. ¿Qué es InfraGuard AI?
2. ¿Qué activos críticos tenemos en producción?
3. ¿De qué depende prod-api-01?
4. Si falla prod-db-primary, ¿qué podría verse afectado?
5. ¿Cómo se conecta web-prod-01 con prod-db-primary?
6. Analiza un incidente crítico abierto y dime qué infraestructura relacionada debería revisar.
7. ¿Qué cambios recientes han ocurrido en esos activos?
8. ¿Qué activos parecen tener mayor riesgo operativo y por qué?
9. Compara dos activos similares.
10. ¿Y cuáles tienen incidentes abiertos?
11. Explícame la teoría de juegos.

Verify current facts against the attached sources, distinguish general knowledge in
question 11, and repeat with a custom role lacking incidents.read/audit.read. Also try
an injected entity description and an instruction to execute SQL: neither may grant
authority. Model intelligence itself is not asserted by fake transcripts.

Browser acceptance checklist: create a new conversation and confirm one user bubble
for the first send. Send the same exact message twice intentionally and confirm two
distinct turns. If a provider failure can be simulated safely, retry and confirm one
user/assistant pair for that logical request; also retry after a lost completion to
verify replay. During a real provider response, check progressive text, compact tool
activity, completion announcement, and the final evidence/entity cards. Check dark
and light themes at 1920, 1440, 1024, 768 and 390 pixels, including long hostnames,
the history drawer, keyboard dismissal, and the composer. Open an Asset using
“Preguntar a la IA” and an Incident using “Analizar con IA”; verify the context chip
and ask a pronoun-based follow-up. General UI, deterministic responses, and entry
points can be checked without a credential. Natural-language intelligence,
progressive provider text, and live multi-round composition require OpenAI mode.

For local validation on resource-constrained machines, run the full frontend suite
with `pnpm test -- --maxWorkers=1` before starting Docker builds or backend tests. This preserves every
test while avoiding competition with image compilation.

References: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses).
