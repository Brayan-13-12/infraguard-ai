/**
 * Audit log domain types (Governance & Administration - Phase 1).
 *
 * The audit log is read-only and append-only: there is no create / update /
 * delete shape here. Values are stored in English and match the backend
 * `StrEnum`s exactly; the UI translates them only for display.
 */

/**
 * The full action vocabulary the backend can store. Only the first eight are
 * ever emitted in Phase 1; `DELETE` / `RESTORE` (Trash) and `ROLE_*` /
 * `PERMISSION_CHANGED` (RBAC) are reserved for later Governance phases.
 */
export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGED",
  "RELATION_CHANGED",
  "RESOLVED",
  "REOPENED",
  "LOGIN",
  "LOGOUT",
  "DELETE",
  "RESTORE",
  "ROLE_ASSIGNED",
  "ROLE_REMOVED",
  "PERMISSION_CHANGED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Actions offered in the filter toolbar - the ones actually produced today. */
export const FILTERABLE_AUDIT_ACTIONS: readonly AuditAction[] = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGED",
  "RELATION_CHANGED",
  "RESOLVED",
  "REOPENED",
  "LOGIN",
  "LOGOUT",
];

export const AUDIT_ENTITY_TYPES = [
  "Asset",
  "Incident",
  "Authentication",
  "User",
  "Role",
  "Permission",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const FILTERABLE_AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = [
  "Asset",
  "Incident",
  "Authentication",
];

/** One recorded field change: a safe serialized `old` -> `new`. */
export interface AuditChange {
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

/**
 * A row in the audit list. Lightweight: `change_count` is the true total,
 * `change_preview` is a bounded slice (first few changes) so the timeline can
 * show what changed inline without a per-row detail request. The full change
 * set stays exclusive to the detail endpoint.
 */
export interface AuditEventListItem {
  id: string;
  occurred_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  change_count: number;
  change_preview: AuditChange[];
}

/**
 * Values longer than this (or belonging to a known long-text field) are not
 * rendered inline in the timeline - the feed shows "campo modificado" and the
 * full before/after stays in the detail workspace.
 */
export const AUDIT_INLINE_VALUE_MAX = 42;

/** Fields whose value is prose - never previewed inline, only in the detail. */
const LONG_TEXT_FIELDS = new Set([
  "description",
  "notes",
  "summary",
  "message",
  "user_agent",
  "comment",
]);

export function isInlinePreviewable(change: AuditChange): boolean {
  if (LONG_TEXT_FIELDS.has(change.field_name.toLowerCase())) return false;
  const longest = Math.max(
    change.old_value?.length ?? 0,
    change.new_value?.length ?? 0,
  );
  return longest <= AUDIT_INLINE_VALUE_MAX;
}

/** Full audit event: actor + entity + request context + field changes. */
export interface AuditEventDetail {
  id: string;
  occurred_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  changes: AuditChange[];
}

export interface AuditPage {
  items: AuditEventListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AuditSummary {
  events_today: number;
  changes_today: number;
  logins_today: number;
  active_actors_today: number;
}

/** An audit event describing an entity the UI can deep-link to. */
export function auditEntityHref(
  entityType: string,
  entityId: string | null,
): string | null {
  if (!entityId) return null;
  if (entityType === "Asset") return `/assets/${entityId}`;
  if (entityType === "Incident") return `/incidents/${entityId}`;
  return null;
}

/** LOGIN / LOGOUT are not a mutation - they never carry a field-change table. */
export function isLifecycleOnlyAction(action: string): boolean {
  return action === "LOGIN" || action === "LOGOUT";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export function isAuditEventListItem(value: unknown): value is AuditEventListItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.occurred_at === "string" &&
    typeof value.action === "string" &&
    typeof value.entity_type === "string" &&
    nullableString(value.entity_id) &&
    nullableString(value.entity_label) &&
    nullableString(value.actor_user_id) &&
    nullableString(value.actor_email) &&
    typeof value.change_count === "number" &&
    Array.isArray(value.change_preview) &&
    value.change_preview.every(isAuditChange)
  );
}

export function isAuditPage(value: unknown): value is AuditPage {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.items) &&
    value.items.every(isAuditEventListItem) &&
    typeof value.page === "number" &&
    typeof value.page_size === "number" &&
    typeof value.total === "number" &&
    typeof value.total_pages === "number"
  );
}

function isAuditChange(value: unknown): value is AuditChange {
  if (!isRecord(value)) return false;
  return (
    typeof value.field_name === "string" &&
    nullableString(value.old_value) &&
    nullableString(value.new_value)
  );
}

export function isAuditEventDetail(value: unknown): value is AuditEventDetail {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.occurred_at === "string" &&
    typeof value.action === "string" &&
    typeof value.entity_type === "string" &&
    nullableString(value.entity_id) &&
    nullableString(value.entity_label) &&
    nullableString(value.actor_user_id) &&
    nullableString(value.actor_email) &&
    nullableString(value.request_id) &&
    nullableString(value.ip_address) &&
    nullableString(value.user_agent) &&
    (value.metadata === null || isRecord(value.metadata)) &&
    Array.isArray(value.changes) &&
    value.changes.every(isAuditChange)
  );
}

export function isAuditSummary(value: unknown): value is AuditSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.events_today === "number" &&
    typeof value.changes_today === "number" &&
    typeof value.logins_today === "number" &&
    typeof value.active_actors_today === "number"
  );
}
