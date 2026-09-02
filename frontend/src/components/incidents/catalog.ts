/**
 * Display helpers for the incident catalog vocabularies.
 *
 * The values themselves are English and match the backend enums; these maps only
 * translate them for display. Each `*Options` helper returns `{ value, label }[]`
 * for a `<Select>` (value = English, label = translated).
 */

import type { SelectOption } from "@/components/ui/Select";
import type { TranslationKey } from "@/i18n";
import {
  INCIDENT_EVENT_TYPES,
  INCIDENT_PRIORITIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type IncidentEventType,
  type IncidentPriority,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/types/incident";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const SEVERITY_KEYS: Record<IncidentSeverity, TranslationKey> = {
  Critical: "incidentCatalog.severity.critical",
  High: "incidentCatalog.severity.high",
  Medium: "incidentCatalog.severity.medium",
  Low: "incidentCatalog.severity.low",
};

export const INCIDENT_STATUS_KEYS: Record<IncidentStatus, TranslationKey> = {
  Open: "incidentCatalog.status.open",
  Investigating: "incidentCatalog.status.investigating",
  Identified: "incidentCatalog.status.identified",
  Monitoring: "incidentCatalog.status.monitoring",
  Resolved: "incidentCatalog.status.resolved",
  Closed: "incidentCatalog.status.closed",
};

export const PRIORITY_KEYS: Record<IncidentPriority, TranslationKey> = {
  P1: "incidentCatalog.priority.p1",
  P2: "incidentCatalog.priority.p2",
  P3: "incidentCatalog.priority.p3",
  P4: "incidentCatalog.priority.p4",
};

export const severityLabel = (t: T, v: IncidentSeverity) => t(SEVERITY_KEYS[v]);
export const incidentStatusLabel = (t: T, v: IncidentStatus) => t(INCIDENT_STATUS_KEYS[v]);
export const priorityLabel = (t: T, v: IncidentPriority) => t(PRIORITY_KEYS[v]);

const opts = <V extends string>(values: readonly V[], keys: Record<V, TranslationKey>, t: T) =>
  values.map((v): SelectOption => ({ value: v, label: t(keys[v]) }));

export const severityOptions = (t: T) => opts(INCIDENT_SEVERITIES, SEVERITY_KEYS, t);
export const incidentStatusOptions = (t: T) =>
  opts(INCIDENT_STATUSES, INCIDENT_STATUS_KEYS, t);
export const priorityOptions = (t: T) => opts(INCIDENT_PRIORITIES, PRIORITY_KEYS, t);

/**
 * Tone for the severity badge - a restrained semantic ramp:
 * Critical = danger (red), High = warning (orange), Medium = caution (amber),
 * Low = neutral. Colour is a hint only; the translated label is always shown.
 */
export const SEVERITY_TONE: Record<
  IncidentSeverity,
  "danger" | "warning" | "caution" | "neutral"
> = {
  Critical: "danger",
  High: "warning",
  Medium: "caution",
  Low: "neutral",
};

/**
 * Tone for the status badge. Deliberately quiet so it does not compete with
 * severity: only Resolved is coloured "success"; the working states share
 * calm info/caution tones and Closed is neutral.
 */
export const INCIDENT_STATUS_TONE: Record<
  IncidentStatus,
  "info" | "warning" | "caution" | "success" | "neutral"
> = {
  Open: "info",
  Investigating: "warning",
  Identified: "caution",
  Monitoring: "caution",
  Resolved: "success",
  Closed: "neutral",
};

/** Icon hint per timeline event type. Rendered muted - never a bright colour. */
export const EVENT_ICON: Record<
  IncidentEventType,
  "created" | "status" | "severity" | "priority" | "owner" | "asset" | "comment" | "resolved" | "reopened"
> = {
  CREATED: "created",
  STATUS_CHANGED: "status",
  SEVERITY_CHANGED: "severity",
  PRIORITY_CHANGED: "priority",
  OWNER_CHANGED: "owner",
  ASSET_ADDED: "asset",
  ASSET_REMOVED: "asset",
  COMMENT: "comment",
  RESOLVED: "resolved",
  REOPENED: "reopened",
};

export const EVENT_TYPES = INCIDENT_EVENT_TYPES;
