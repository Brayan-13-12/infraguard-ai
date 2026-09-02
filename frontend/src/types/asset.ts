/**
 * Asset domain types. Catalog values are stored in English (they match the
 * backend `StrEnum`s exactly); the UI translates them only for display.
 */

export const ASSET_TYPES = [
  "Server",
  "Virtual Machine",
  "Database",
  "Application",
  "Network Device",
  "Container",
  "Kubernetes Cluster",
  "Cloud Resource",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ENVIRONMENTS = ["Production", "Staging", "Development", "Test"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const CRITICALITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const ASSET_STATUSES = ["Operational", "Degraded", "Maintenance", "Offline"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface Asset {
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

export interface AssetPage {
  items: Asset[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Fields the create form submits. */
export interface AssetCreateInput {
  name: string;
  asset_type: AssetType;
  environment: Environment;
  criticality: Criticality;
  status: AssetStatus;
  hostname?: string | null;
  ip_address?: string | null;
  owner?: string | null;
  description?: string | null;
}

/** Partial update - any subset of the content fields (never `is_active`). */
export type AssetUpdateInput = Partial<AssetCreateInput>;

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** The network response is untrusted - validate its shape. */
export function isAsset(value: unknown): value is Asset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    isOneOf(ASSET_TYPES, v.asset_type) &&
    isOneOf(ENVIRONMENTS, v.environment) &&
    isOneOf(CRITICALITIES, v.criticality) &&
    isOneOf(ASSET_STATUSES, v.status) &&
    (v.hostname === null || typeof v.hostname === "string") &&
    (v.ip_address === null || typeof v.ip_address === "string") &&
    (v.owner === null || typeof v.owner === "string") &&
    (v.description === null || typeof v.description === "string") &&
    typeof v.is_active === "boolean" &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string"
  );
}

/** Aggregate inventory counts from `GET /api/v1/assets/summary`. */
export interface AssetSummary {
  total: number;
  active: number;
  inactive: number;
  by_criticality: Record<string, number>;
  by_status: Record<string, number>;
  by_environment: Record<string, number>;
  by_type: Record<string, number>;
}

function isCountMap(v: unknown): v is Record<string, number> {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.values(v as Record<string, unknown>).every((n) => typeof n === "number")
  );
}

export function isAssetSummary(value: unknown): value is AssetSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.total === "number" &&
    typeof v.active === "number" &&
    typeof v.inactive === "number" &&
    isCountMap(v.by_criticality) &&
    isCountMap(v.by_status) &&
    isCountMap(v.by_environment) &&
    isCountMap(v.by_type)
  );
}

export function isAssetPage(value: unknown): value is AssetPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.items) &&
    v.items.every(isAsset) &&
    typeof v.page === "number" &&
    typeof v.page_size === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}
