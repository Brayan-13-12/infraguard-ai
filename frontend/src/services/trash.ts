import { TRASH_ENDPOINT } from "@/lib/config";
import {
  isTrashAssetDetail,
  isTrashAssetPage,
  isTrashIncidentDetail,
  isTrashIncidentPage,
  isTrashSummary,
  type TrashAssetDetail,
  type TrashAssetPage,
  type TrashIncidentDetail,
  type TrashIncidentPage,
  type TrashSummary,
} from "@/types/trash";

const REQUEST_TIMEOUT_MS = 8000;

export type TrashErrorKind =
  | "unreachable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "unexpected";

export type TrashResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { kind: TrashErrorKind } };

export interface TrashAssetListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  type?: string;
  criticality?: string | string[];
  deletedBy?: string;
  from?: string;
  to?: string;
}

export interface TrashIncidentListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  severity?: string | string[];
  status?: string | string[];
  deletedBy?: string;
  from?: string;
  to?: string;
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
      headers: { Accept: "application/json", ...init.headers },
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

function errorFor(status: number): { kind: TrashErrorKind } {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  return { kind: "unexpected" };
}

function appendMulti(qs: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (value === undefined) return;
  for (const v of Array.isArray(value) ? value : [value]) {
    if (v) qs.append(key, v);
  }
}

function buildAssetQuery(params: TrashAssetListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  if (params.pageSize) qs.set("page_size", String(params.pageSize));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.type) qs.set("type", params.type);
  appendMulti(qs, "criticality", params.criticality);
  if (params.deletedBy?.trim()) qs.set("deleted_by", params.deletedBy.trim());
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return qs.toString();
}

function buildIncidentQuery(params: TrashIncidentListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  if (params.pageSize) qs.set("page_size", String(params.pageSize));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  appendMulti(qs, "severity", params.severity);
  appendMulti(qs, "status", params.status);
  if (params.deletedBy?.trim()) qs.set("deleted_by", params.deletedBy.trim());
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return qs.toString();
}

export async function getTrashSummary(): Promise<TrashResult<TrashSummary>> {
  const res = await request(`${TRASH_ENDPOINT}/summary`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isTrashSummary(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function listTrashAssets(
  params: TrashAssetListParams = {},
): Promise<TrashResult<TrashAssetPage>> {
  const res = await request(`${TRASH_ENDPOINT}/assets?${buildAssetQuery(params)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isTrashAssetPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getTrashAsset(id: string): Promise<TrashResult<TrashAssetDetail>> {
  const res = await request(`${TRASH_ENDPOINT}/assets/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isTrashAssetDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function restoreTrashAsset(id: string): Promise<TrashResult<null>> {
  const res = await request(`${TRASH_ENDPOINT}/assets/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200) return { ok: true, data: null };
  return { ok: false, error: errorFor(res.status) };
}

export async function listTrashIncidents(
  params: TrashIncidentListParams = {},
): Promise<TrashResult<TrashIncidentPage>> {
  const res = await request(`${TRASH_ENDPOINT}/incidents?${buildIncidentQuery(params)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isTrashIncidentPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getTrashIncident(id: string): Promise<TrashResult<TrashIncidentDetail>> {
  const res = await request(`${TRASH_ENDPOINT}/incidents/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isTrashIncidentDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function restoreTrashIncident(id: string): Promise<TrashResult<null>> {
  const res = await request(`${TRASH_ENDPOINT}/incidents/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200) return { ok: true, data: null };
  return { ok: false, error: errorFor(res.status) };
}
