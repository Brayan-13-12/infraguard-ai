import { TOPOLOGY_ENDPOINT } from "@/lib/config";
import {
  isGraphHealth,
  isImpactResponse,
  isPathResponse,
  isSubgraphResponse,
  type GraphHealth,
  type ImpactResponse,
  type PathResponse,
  type SubgraphParams,
  type SubgraphResponse,
} from "@/types/topology";

const REQUEST_TIMEOUT_MS = 10000;

export type TopologyErrorKind = "unreachable" | "unauthorized" | "forbidden" | "not_found" | "unexpected";

export interface TopologyError {
  kind: TopologyErrorKind;
}

export type TopologyResult<T> = { ok: true; data: T } | { ok: false; error: TopologyError };

async function request(url: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function errorFor(status: number): TopologyError {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  return { kind: "unexpected" };
}

export async function getSubgraph(params: SubgraphParams): Promise<TopologyResult<SubgraphResponse>> {
  const qs = new URLSearchParams();
  qs.set("root_asset_id", params.rootAssetId);
  if (params.depth !== undefined) qs.set("depth", String(params.depth));
  if (params.direction) qs.set("direction", params.direction);
  if (params.environment) qs.set("environment", params.environment);
  if (params.criticality) qs.set("criticality", params.criticality);
  if (params.status) qs.set("status", params.status);
  if (params.nodeCap !== undefined) qs.set("node_cap", String(params.nodeCap));
  for (const t of params.relationshipType ?? []) qs.append("relationship_type", t);

  const res = await request(`${TOPOLOGY_ENDPOINT}/subgraph?${qs.toString()}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isSubgraphResponse(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getAssetImpact(
  assetId: string,
  maxDepth = 3,
): Promise<TopologyResult<ImpactResponse>> {
  const res = await request(
    `${TOPOLOGY_ENDPOINT}/assets/${encodeURIComponent(assetId)}/impact?max_depth=${maxDepth}`,
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isImpactResponse(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getPath(
  sourceAssetId: string,
  targetAssetId: string,
  maxDepth = 3,
): Promise<TopologyResult<PathResponse>> {
  const qs = new URLSearchParams({
    source_asset_id: sourceAssetId,
    target_asset_id: targetAssetId,
    max_depth: String(maxDepth),
  });
  const res = await request(`${TOPOLOGY_ENDPOINT}/path?${qs.toString()}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isPathResponse(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getGraphHealth(): Promise<TopologyResult<GraphHealth>> {
  const res = await request(`${TOPOLOGY_ENDPOINT}/health`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isGraphHealth(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

