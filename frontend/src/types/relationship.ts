/**
 * Asset relationship domain types (Asset Relationships & Topology milestone).
 * PostgreSQL is canonical; these mirror `app/schemas/relationship.py` exactly.
 */

export const RELATIONSHIP_TYPES = [
  "depends_on",
  "hosts",
  "connects_to",
  "uses",
  "provides_service_to",
  "member_of",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface AssetSummary {
  id: string;
  name: string;
  hostname: string | null;
  asset_type: string;
  environment: string;
  criticality: string;
  status: string;
  is_active: boolean;
}

export interface RelationshipSummary {
  total: number;
  connected_assets: number;
  relationship_types: number;
  assets_without_relationships: number;
}

export interface RelationshipDetail {
  id: string;
  source_asset_id: string;
  target_asset_id: string;
  relationship_type: RelationshipType;
  description: string | null;
  created_at: string;
  updated_at: string;
  source: AssetSummary;
  target: AssetSummary;
}

export interface RelationshipPage {
  items: RelationshipDetail[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface RelationshipCounts {
  outgoing: number;
  incoming: number;
  total: number;
}

export interface AssetRelationshipsGrouped {
  outgoing: RelationshipDetail[];
  incoming: RelationshipDetail[];
  counts: RelationshipCounts;
}

export interface RelationshipTypeInfo {
  code: RelationshipType;
  label: string;
  inverse_label: string;
  description: string;
  category: string;
  directed: boolean;
  propagates_impact: boolean;
}

export interface RelationshipTypeCatalog {
  types: RelationshipTypeInfo[];
}

export interface RelationshipCreateInput {
  source_asset_id: string;
  target_asset_id: string;
  relationship_type: RelationshipType;
  description?: string | null;
}

export interface RelationshipUpdateInput {
  relationship_type?: RelationshipType;
  description?: string | null;
}

// --- runtime guards ---------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAssetSummary(v: unknown): v is AssetSummary {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    (v.hostname === null || v.hostname === undefined || typeof v.hostname === "string") &&
    typeof v.asset_type === "string" &&
    typeof v.environment === "string" &&
    typeof v.criticality === "string" &&
    typeof v.status === "string" &&
    typeof v.is_active === "boolean"
  );
}

export function isRelationshipSummary(v: unknown): v is RelationshipSummary {
  return (
    isRecord(v) &&
    typeof v.total === "number" &&
    typeof v.connected_assets === "number" &&
    typeof v.relationship_types === "number" &&
    typeof v.assets_without_relationships === "number"
  );
}

export function isRelationshipDetail(v: unknown): v is RelationshipDetail {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.source_asset_id === "string" &&
    typeof v.target_asset_id === "string" &&
    typeof v.relationship_type === "string" &&
    (v.description === null || typeof v.description === "string") &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string" &&
    isAssetSummary(v.source) &&
    isAssetSummary(v.target)
  );
}

export function isRelationshipPage(v: unknown): v is RelationshipPage {
  return (
    isRecord(v) &&
    Array.isArray(v.items) &&
    v.items.every(isRelationshipDetail) &&
    typeof v.page === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}

export function isAssetRelationshipsGrouped(v: unknown): v is AssetRelationshipsGrouped {
  return (
    isRecord(v) &&
    Array.isArray(v.outgoing) &&
    v.outgoing.every(isRelationshipDetail) &&
    Array.isArray(v.incoming) &&
    v.incoming.every(isRelationshipDetail) &&
    isRecord(v.counts) &&
    typeof v.counts.outgoing === "number" &&
    typeof v.counts.incoming === "number" &&
    typeof v.counts.total === "number"
  );
}

export function isRelationshipTypeCatalog(v: unknown): v is RelationshipTypeCatalog {
  return (
    isRecord(v) &&
    Array.isArray(v.types) &&
    v.types.every(
      (t) =>
        isRecord(t) &&
        typeof t.code === "string" &&
        typeof t.label === "string" &&
        typeof t.inverse_label === "string" &&
        typeof t.propagates_impact === "boolean",
    )
  );
}
