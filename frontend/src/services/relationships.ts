import { ASSETS_ENDPOINT, RELATIONSHIPS_ENDPOINT, RELATIONSHIPS_PAGE_SIZE } from "@/lib/config";
import {
  isAssetRelationshipsGrouped,
  isRelationshipDetail,
  isRelationshipPage,
  isRelationshipSummary,
  isRelationshipTypeCatalog,
  type AssetRelationshipsGrouped,
  type RelationshipCreateInput,
  type RelationshipDetail,
  type RelationshipPage,
  type RelationshipSummary,
  type RelationshipTypeCatalog,
  type RelationshipUpdateInput,
} from "@/types/relationship";

const REQUEST_TIMEOUT_MS = 8000;

export type RelationshipErrorKind =
  | "unreachable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "duplicate"
  | "asset_trashed"
  | "validation"
  | "unexpected";

export interface RelationshipError {
  kind: RelationshipErrorKind;
  message?: string;
}

export type RelationshipResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RelationshipError };

async function request(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
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

function detailMessage(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return undefined;
}

function errorFor(status: number, body: unknown): RelationshipError {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  if (status === 422) return { kind: "validation", message: detailMessage(body) };
  if (status === 409) {
    const msg = detailMessage(body) ?? "";
    return {
      kind: msg.toLowerCase().includes("trash") ? "asset_trashed" : "duplicate",
      message: msg,
    };
  }
  return { kind: "unexpected" };
}

export interface RelationshipListParams {
  page?: number;
  pageSize?: number;
  assetId?: string;
  direction?: "both" | "outgoing" | "incoming";
  relationshipType?: string[];
  environment?: string;
  criticality?: string;
  /** Either endpoint's asset type - the global Dependencias module's filter. */
  assetType?: string;
  /** Matches source/target name, hostname, or the relationship description. */
  search?: string;
}

function buildQuery(params: RelationshipListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  qs.set("page_size", String(params.pageSize ?? RELATIONSHIPS_PAGE_SIZE));
  if (params.assetId) qs.set("asset_id", params.assetId);
  if (params.direction) qs.set("direction", params.direction);
  if (params.environment) qs.set("environment", params.environment);
  if (params.criticality) qs.set("criticality", params.criticality);
  if (params.assetType) qs.set("asset_type", params.assetType);
  if (params.search) qs.set("search", params.search);
  for (const t of params.relationshipType ?? []) qs.append("relationship_type", t);
  return qs.toString();
}

export async function listRelationships(
  params: RelationshipListParams = {},
): Promise<RelationshipResult<RelationshipPage>> {
  const res = await request(`${RELATIONSHIPS_ENDPOINT}?${buildQuery(params)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRelationshipPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getAssetRelationships(
  assetId: string,
): Promise<RelationshipResult<AssetRelationshipsGrouped>> {
  const res = await request(
    `${ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}/relationships`,
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAssetRelationshipsGrouped(res.body)) {
    return { ok: true, data: res.body };
  }
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getRelationshipsSummary(): Promise<RelationshipResult<RelationshipSummary>> {
  const res = await request(`${RELATIONSHIPS_ENDPOINT}/summary`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRelationshipSummary(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getRelationshipTypes(): Promise<RelationshipResult<RelationshipTypeCatalog>> {
  const res = await request(`${RELATIONSHIPS_ENDPOINT}/types`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRelationshipTypeCatalog(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function createRelationship(
  input: RelationshipCreateInput,
): Promise<RelationshipResult<RelationshipDetail>> {
  const res = await request(RELATIONSHIPS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 201 && isRelationshipDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function updateRelationship(
  id: string,
  input: RelationshipUpdateInput,
): Promise<RelationshipResult<RelationshipDetail>> {
  const res = await request(`${RELATIONSHIPS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRelationshipDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function deleteRelationship(id: string): Promise<RelationshipResult<null>> {
  const res = await request(`${RELATIONSHIPS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200) return { ok: true, data: null };
  return { ok: false, error: errorFor(res.status, res.body) };
}
