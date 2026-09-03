/**
 * Incident domain types. Catalog values are stored in English (they match the
 * backend `StrEnum`s exactly); the UI translates them only for display.
 */

export const INCIDENT_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "Open",
  "Investigating",
  "Identified",
  "Monitoring",
  "Resolved",
  "Closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Non-terminal statuses - an incident in one of these is "open". */
export const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "Open",
  "Investigating",
  "Identified",
  "Monitoring",
];
export const TERMINAL_INCIDENT_STATUSES: readonly IncidentStatus[] = ["Resolved", "Closed"];

export const INCIDENT_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

export const INCIDENT_EVENT_TYPES = [
  "CREATED",
  "STATUS_CHANGED",
  "SEVERITY_CHANGED",
  "PRIORITY_CHANGED",
  "OWNER_CHANGED",
  "ASSET_ADDED",
  "ASSET_REMOVED",
  "COMMENT",
  "RESOLVED",
  "REOPENED",
] as const;
export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[number];

/** A row in the incidents list. */
export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  priority: IncidentPriority;
  owner: string | null;
  started_at: string;
  detected_at: string | null;
  resolved_at: string | null;
  affected_asset_count: number;
  created_at: string;
  updated_at: string;
}

/** A compact projection of an affected asset, embedded in the incident detail. */
export interface IncidentAssetRef {
  id: string;
  name: string;
  asset_type: string;
  environment: string;
  criticality: string;
  status: string;
  is_active: boolean;
  /** Non-null when the asset has been moved to Trash - the relationship is kept
   *  (history) and the UI badges it "En papelera". */
  deleted_at: string | null;
}

export interface IncidentEvent {
  id: string;
  type: IncidentEventType;
  message: string;
  created_by: string | null;
  actor_email: string | null;
  created_at: string;
}

/** Full incident detail: metadata + affected assets + timeline. */
export interface IncidentDetail {
  id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  priority: IncidentPriority;
  owner: string | null;
  started_at: string;
  detected_at: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  affected_assets: IncidentAssetRef[];
  timeline: IncidentEvent[];
}

export interface IncidentPage {
  items: Incident[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Aggregate incident counts from `GET /api/v1/incidents/summary`. */
export interface IncidentSummary {
  total: number;
  open: number;
  critical_open: number;
  investigating: number;
  monitoring: number;
  resolved_recently: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
}

/** Fields the create form submits. */
export interface IncidentCreateInput {
  title: string;
  description?: string | null;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  status?: IncidentStatus;
  owner?: string | null;
  started_at?: string | null;
  detected_at?: string | null;
  asset_ids?: string[];
}

/** Partial update - any subset of the editable fields. */
export type IncidentUpdateInput = Partial<IncidentCreateInput>;

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function isCountMap(v: unknown): v is Record<string, number> {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.values(v as Record<string, unknown>).every((n) => typeof n === "number")
  );
}

export function isIncident(value: unknown): value is Incident {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    isOneOf(INCIDENT_SEVERITIES, v.severity) &&
    isOneOf(INCIDENT_STATUSES, v.status) &&
    isOneOf(INCIDENT_PRIORITIES, v.priority) &&
    (v.owner === null || typeof v.owner === "string") &&
    typeof v.started_at === "string" &&
    (v.detected_at === null || typeof v.detected_at === "string") &&
    (v.resolved_at === null || typeof v.resolved_at === "string") &&
    typeof v.affected_asset_count === "number" &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string"
  );
}

export function isIncidentPage(value: unknown): value is IncidentPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.items) &&
    v.items.every(isIncident) &&
    typeof v.page === "number" &&
    typeof v.page_size === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}

function isEvent(value: unknown): value is IncidentEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    isOneOf(INCIDENT_EVENT_TYPES, v.type) &&
    typeof v.message === "string" &&
    (v.created_by === null || typeof v.created_by === "string") &&
    (v.actor_email === null || typeof v.actor_email === "string") &&
    typeof v.created_at === "string"
  );
}

export function isIncidentDetail(value: unknown): value is IncidentDetail {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (v.description === null || typeof v.description === "string") &&
    isOneOf(INCIDENT_SEVERITIES, v.severity) &&
    isOneOf(INCIDENT_STATUSES, v.status) &&
    isOneOf(INCIDENT_PRIORITIES, v.priority) &&
    typeof v.created_by === "string" &&
    Array.isArray(v.affected_assets) &&
    Array.isArray(v.timeline) &&
    v.timeline.every(isEvent)
  );
}

export function isIncidentSummary(value: unknown): value is IncidentSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.total === "number" &&
    typeof v.open === "number" &&
    typeof v.critical_open === "number" &&
    typeof v.investigating === "number" &&
    typeof v.monitoring === "number" &&
    typeof v.resolved_recently === "number" &&
    isCountMap(v.by_severity) &&
    isCountMap(v.by_status)
  );
}
