/**
 * Trash domain types (Governance & Administration - Phase 2).
 *
 * Trash is a **read + restore** surface for soft-deleted records. There is no
 * permanent-delete shape here - that is deferred to RBAC. Catalog values match
 * the backend `StrEnum`s; the UI translates them only for display.
 */

import {
  ASSET_STATUSES,
  ASSET_TYPES,
  CRITICALITIES,
  ENVIRONMENTS,
  type AssetStatus,
  type AssetType,
  type Criticality,
  type Environment,
} from "@/types/asset";
import {
  INCIDENT_PRIORITIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type IncidentEvent,
  type IncidentPriority,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/types/incident";

/** The "who / when" every trashed record carries. */
interface DeletedMeta {
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_email: string | null;
}

export interface TrashAssetListItem extends DeletedMeta {
  id: string;
  name: string;
  asset_type: AssetType;
  environment: Environment;
  criticality: Criticality;
  status: AssetStatus;
}

export interface TrashAssetDetail extends DeletedMeta {
  id: string;
  name: string;
  asset_type: AssetType;
  environment: Environment;
  criticality: Criticality;
  status: AssetStatus;
  hostname: string | null;
  ip_address: string | null;
  owner: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrashIncidentListItem extends DeletedMeta {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  priority: IncidentPriority;
  owner: string | null;
  affected_asset_count: number;
}

export interface TrashIncidentAssetRef {
  id: string;
  name: string;
  asset_type: string;
  environment: string;
  criticality: string;
  status: string;
  is_active: boolean;
  deleted_at: string | null;
}

export interface TrashIncidentDetail extends DeletedMeta {
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
  affected_assets: TrashIncidentAssetRef[];
  timeline: IncidentEvent[];
}

export interface TrashAssetPage {
  items: TrashAssetListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TrashIncidentPage {
  items: TrashIncidentListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TrashSummary {
  assets: number;
  incidents: number;
}

// --- runtime guards (the network response is untrusted) --------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function isAssetCatalog(v: Record<string, unknown>): boolean {
  return (
    oneOf(ASSET_TYPES, v.asset_type) &&
    oneOf(ENVIRONMENTS, v.environment) &&
    oneOf(CRITICALITIES, v.criticality) &&
    oneOf(ASSET_STATUSES, v.status)
  );
}

function isIncidentCatalog(v: Record<string, unknown>): boolean {
  return (
    oneOf(INCIDENT_SEVERITIES, v.severity) &&
    oneOf(INCIDENT_STATUSES, v.status) &&
    oneOf(INCIDENT_PRIORITIES, v.priority)
  );
}

function hasDeletedMeta(v: Record<string, unknown>): boolean {
  return (
    typeof v.deleted_at === "string" &&
    (v.deleted_by === null || typeof v.deleted_by === "string") &&
    (v.deleted_by_email === null || typeof v.deleted_by_email === "string")
  );
}

export function isTrashAssetListItem(value: unknown): value is TrashAssetListItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isAssetCatalog(value) &&
    hasDeletedMeta(value)
  );
}

export function isTrashAssetPage(value: unknown): value is TrashAssetPage {
  if (!isRecord(value)) return false;
  return Array.isArray(value.items) && value.items.every(isTrashAssetListItem) && isPageMeta(value);
}

export function isTrashIncidentListItem(value: unknown): value is TrashIncidentListItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isIncidentCatalog(value) &&
    typeof value.affected_asset_count === "number" &&
    hasDeletedMeta(value)
  );
}

export function isTrashIncidentPage(value: unknown): value is TrashIncidentPage {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.items) && value.items.every(isTrashIncidentListItem) && isPageMeta(value)
  );
}

export function isTrashAssetDetail(value: unknown): value is TrashAssetDetail {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isAssetCatalog(value) &&
    typeof value.is_active === "boolean" &&
    typeof value.created_at === "string" &&
    hasDeletedMeta(value)
  );
}

export function isTrashIncidentDetail(value: unknown): value is TrashIncidentDetail {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isIncidentCatalog(value) &&
    Array.isArray(value.affected_assets) &&
    Array.isArray(value.timeline) &&
    typeof value.created_by === "string" &&
    hasDeletedMeta(value)
  );
}

export function isTrashSummary(value: unknown): value is TrashSummary {
  if (!isRecord(value)) return false;
  return typeof value.assets === "number" && typeof value.incidents === "number";
}

function isPageMeta(v: Record<string, unknown>): boolean {
  return (
    typeof v.page === "number" &&
    typeof v.page_size === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}
