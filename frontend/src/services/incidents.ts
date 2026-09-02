import { INCIDENTS_ENDPOINT, INCIDENTS_SUMMARY_ENDPOINT } from "@/lib/config";
import {
  isIncidentDetail,
  isIncidentPage,
  isIncidentSummary,
  type IncidentCreateInput,
  type IncidentDetail,
  type IncidentPage,
  type IncidentSummary,
  type IncidentUpdateInput,
} from "@/types/incident";

const REQUEST_TIMEOUT_MS = 8000;

const INCIDENT_FIELDS = [
  "title",
  "description",
  "severity",
  "priority",
  "status",
  "owner",
  "started_at",
  "detected_at",
  "asset_ids",
] as const;
export type IncidentField = (typeof INCIDENT_FIELDS)[number];
export type IncidentFieldErrors = Partial<Record<IncidentField, string>>;

export type IncidentErrorKind =
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "unexpected";

export interface IncidentError {
  kind: IncidentErrorKind;
  fields?: IncidentFieldErrors;
}

export type IncidentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IncidentError };

export type IncidentSort = "recent" | "oldest" | "started" | "severity";

export interface IncidentListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  severity?: string | string[];
  status?: string | string[];
  priority?: string | string[];
  assetId?: string;
  startedFrom?: string;
  startedTo?: string;
  sort?: IncidentSort;
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

function parseFieldErrors(body: unknown): IncidentFieldErrors {
  const fields: IncidentFieldErrors = {};
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
        (INCIDENT_FIELDS as readonly string[]).includes(key) &&
        !fields[key as IncidentField]
      ) {
        fields[key as IncidentField] = msg;
      }
    }
  }
  return fields;
}

function errorFor(status: number, body: unknown): IncidentError {
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

function buildQuery(params: IncidentListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  if (params.pageSize) qs.set("page_size", String(params.pageSize));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  appendMulti(qs, "severity", params.severity);
  appendMulti(qs, "status", params.status);
  appendMulti(qs, "priority", params.priority);
  if (params.assetId) qs.set("asset_id", params.assetId);
  if (params.startedFrom) qs.set("started_from", params.startedFrom);
  if (params.startedTo) qs.set("started_to", params.startedTo);
  if (params.sort) qs.set("sort", params.sort);
  return qs.toString();
}

export async function listIncidents(
  params: IncidentListParams = {},
): Promise<IncidentResult<IncidentPage>> {
  const res = await request(`${INCIDENTS_ENDPOINT}?${buildQuery(params)}`, { method: "GET" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isIncidentPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getIncidentSummary(): Promise<IncidentResult<IncidentSummary>> {
  const res = await request(INCIDENTS_SUMMARY_ENDPOINT, { method: "GET" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isIncidentSummary(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getIncident(id: string): Promise<IncidentResult<IncidentDetail>> {
  const res = await request(`${INCIDENTS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isIncidentDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function createIncident(
  input: IncidentCreateInput,
): Promise<IncidentResult<IncidentDetail>> {
  const res = await request(INCIDENTS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 201 && isIncidentDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function updateIncident(
  id: string,
  input: IncidentUpdateInput,
): Promise<IncidentResult<IncidentDetail>> {
  const res = await request(`${INCIDENTS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isIncidentDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

async function lifecycle(
  id: string,
  action: "resolve" | "reopen",
): Promise<IncidentResult<IncidentDetail>> {
  const res = await request(
    `${INCIDENTS_ENDPOINT}/${encodeURIComponent(id)}/${action}`,
    { method: "POST" },
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isIncidentDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export const resolveIncident = (id: string) => lifecycle(id, "resolve");
export const reopenIncident = (id: string) => lifecycle(id, "reopen");
