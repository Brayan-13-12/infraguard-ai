import { ASSETS_ENDPOINT, ASSETS_SUMMARY_ENDPOINT } from "@/lib/config";
import {
  isAsset,
  isAssetPage,
  isAssetSummary,
  type Asset,
  type AssetCreateInput,
  type AssetPage,
  type AssetSummary,
  type AssetUpdateInput,
} from "@/types/asset";

const REQUEST_TIMEOUT_MS = 8000;

const ASSET_FIELDS = [
  "name",
  "asset_type",
  "environment",
  "criticality",
  "status",
  "hostname",
  "ip_address",
  "owner",
  "description",
] as const;
export type AssetField = (typeof ASSET_FIELDS)[number];
export type AssetFieldErrors = Partial<Record<AssetField, string>>;

export type AssetErrorKind =
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "unexpected";

export interface AssetError {
  kind: AssetErrorKind;
  /** Present for `validation` errors. */
  fields?: AssetFieldErrors;
}

export type AssetResult<T> = { ok: true; data: T } | { ok: false; error: AssetError };

export interface AssetListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  assetType?: string;
  environment?: string;
  /** One value or several (repeated `?criticality=` params -> `IN (...)`). */
  criticality?: string | string[];
  /** One value or several (repeated `?status=` params -> `IN (...)`). */
  status?: string | string[];
  isActive?: boolean;
}

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

function parseFieldErrors(body: unknown): AssetFieldErrors {
  const fields: AssetFieldErrors = {};
  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { detail?: unknown }).detail)
  ) {
    for (const item of (body as { detail: unknown[] }).detail) {
      if (typeof item !== "object" || item === null) continue;
      const loc = (item as { loc?: unknown }).loc;
      const msg = (item as { msg?: unknown }).msg;
      if (!Array.isArray(loc) || typeof msg !== "string") continue;
      const key = loc[loc.length - 1];
      if (
        typeof key === "string" &&
        (ASSET_FIELDS as readonly string[]).includes(key) &&
        !fields[key as AssetField]
      ) {
        fields[key as AssetField] = msg;
      }
    }
  }
  return fields;
}

/** Map a non-2xx response to a typed error (used by every call below). */
function errorFor(status: number, body: unknown): AssetError {
  if (status === 401 || status === 403) return { kind: "unauthorized" };
  if (status === 404) return { kind: "not_found" };
  if (status === 422) return { kind: "validation", fields: parseFieldErrors(body) };
  if (status === 429) return { kind: "rate_limited" };
  return { kind: "unexpected" };
}

function appendMulti(qs: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (value === undefined) return;
  for (const v of Array.isArray(value) ? value : [value]) {
    if (v) qs.append(key, v);
  }
}

function buildQuery(params: AssetListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  if (params.pageSize) qs.set("page_size", String(params.pageSize));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.assetType) qs.set("asset_type", params.assetType);
  if (params.environment) qs.set("environment", params.environment);
  appendMulti(qs, "criticality", params.criticality);
  appendMulti(qs, "status", params.status);
  if (params.isActive !== undefined) qs.set("is_active", String(params.isActive));
  return qs.toString();
}

export async function listAssets(
  params: AssetListParams = {},
): Promise<AssetResult<AssetPage>> {
  const res = await request(`${ASSETS_ENDPOINT}?${buildQuery(params)}`, { method: "GET" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAssetPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getAssetSummary(): Promise<AssetResult<AssetSummary>> {
  const res = await request(ASSETS_SUMMARY_ENDPOINT, { method: "GET" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAssetSummary(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getAsset(id: string): Promise<AssetResult<Asset>> {
  const res = await request(`${ASSETS_ENDPOINT}/${encodeURIComponent(id)}`, { method: "GET" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAsset(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function createAsset(input: AssetCreateInput): Promise<AssetResult<Asset>> {
  const res = await request(ASSETS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 201 && isAsset(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function updateAsset(
  id: string,
  input: AssetUpdateInput,
): Promise<AssetResult<Asset>> {
  const res = await request(`${ASSETS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAsset(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

async function lifecycle(
  id: string,
  action: "deactivate" | "reactivate",
): Promise<AssetResult<Asset>> {
  const res = await request(
    `${ASSETS_ENDPOINT}/${encodeURIComponent(id)}/${action}`,
    { method: "POST" },
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAsset(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export const deactivateAsset = (id: string) => lifecycle(id, "deactivate");
export const reactivateAsset = (id: string) => lifecycle(id, "reactivate");
