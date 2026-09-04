/** Topology query types - mirror `app/schemas/topology.py` exactly. */

import type { RelationshipType } from "./relationship";

export type TopologyDirection = "both" | "upstream" | "downstream";

export interface TopologyNode {
  id: string;
  name: string;
  asset_type: string;
  environment: string;
  criticality: string;
  status: string;
  is_active: boolean;
  is_root: boolean;
}

export interface TopologyEdge {
  id: string;
  source_asset_id: string;
  target_asset_id: string;
  relationship_type: RelationshipType;
}

export interface SubgraphResponse {
  root_asset_id: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  depth: number;
  direction: TopologyDirection;
  truncated: boolean;
  source: "postgres" | "neo4j";
}

export interface ImpactedAsset {
  asset: {
    id: string;
    name: string;
    asset_type: string;
    environment: string;
    criticality: string;
    status: string;
    is_active: boolean;
  };
  distance: number;
  path: string[];
}

export interface ImpactResponse {
  root_asset_id: string;
  affected_assets: ImpactedAsset[];
  max_depth: number;
  truncated: boolean;
  source: "postgres" | "neo4j";
}

export interface PathResponse {
  source_asset_id: string;
  target_asset_id: string;
  found: boolean;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  length: number;
  source_engine: "postgres" | "neo4j";
}

export interface GraphHealth {
  configured: boolean;
  status: "operational" | "unavailable" | "not_configured";
  detail: string | null;
}

export interface SubgraphParams {
  rootAssetId: string;
  depth?: number;
  direction?: TopologyDirection;
  relationshipType?: RelationshipType[];
  environment?: string;
  criticality?: string;
  status?: string;
  nodeCap?: number;
}

// --- runtime guards ---------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTopologyNode(v: unknown): v is TopologyNode {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.asset_type === "string" &&
    typeof v.environment === "string" &&
    typeof v.criticality === "string" &&
    typeof v.status === "string" &&
    typeof v.is_active === "boolean" &&
    typeof v.is_root === "boolean"
  );
}

function isTopologyEdge(v: unknown): v is TopologyEdge {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.source_asset_id === "string" &&
    typeof v.target_asset_id === "string" &&
    typeof v.relationship_type === "string"
  );
}

export function isSubgraphResponse(v: unknown): v is SubgraphResponse {
  return (
    isRecord(v) &&
    typeof v.root_asset_id === "string" &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isTopologyNode) &&
    Array.isArray(v.edges) &&
    v.edges.every(isTopologyEdge) &&
    typeof v.depth === "number" &&
    typeof v.truncated === "boolean"
  );
}

export function isImpactResponse(v: unknown): v is ImpactResponse {
  return (
    isRecord(v) &&
    typeof v.root_asset_id === "string" &&
    Array.isArray(v.affected_assets) &&
    v.affected_assets.every(
      (a) => isRecord(a) && isRecord(a.asset) && typeof a.distance === "number",
    ) &&
    typeof v.truncated === "boolean"
  );
}

export function isPathResponse(v: unknown): v is PathResponse {
  return (
    isRecord(v) &&
    typeof v.found === "boolean" &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isTopologyNode) &&
    Array.isArray(v.edges) &&
    v.edges.every(isTopologyEdge)
  );
}

export function isGraphHealth(v: unknown): v is GraphHealth {
  return (
    isRecord(v) &&
    typeof v.configured === "boolean" &&
    typeof v.status === "string"
  );
}
