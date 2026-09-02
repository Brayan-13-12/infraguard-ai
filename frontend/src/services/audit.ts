import { AUDIT_ENDPOINT, AUDIT_SUMMARY_ENDPOINT } from "@/lib/config";
import {
  isAuditEventDetail,
  isAuditPage,
  isAuditSummary,
  type AuditEventDetail,
  type AuditPage,
  type AuditSummary,
} from "@/types/audit";

const REQUEST_TIMEOUT_MS = 8000;

export type AuditErrorKind =
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "unexpected";

export type AuditResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { kind: AuditErrorKind } };

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  action?: string | string[];
  entityType?: string | string[];
  actor?: string;
  entityId?: string;
  /** ISO instant - inclusive lower bound (maps to the `from` query param). */
  from?: string;
  /** ISO instant - inclusive upper bound (maps to the `to` query param). */
  to?: string;
}

async function request(url: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
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

function errorFor(status: number): { kind: AuditErrorKind } {
  if (status === 401 || status === 403) return { kind: "unauthorized" };
  if (status === 404) return { kind: "not_found" };
  return { kind: "unexpected" };
}

function appendMulti(qs: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (value === undefined) return;
  for (const v of Array.isArray(value) ? value : [value]) {
    if (v) qs.append(key, v);
  }
}

function buildQuery(params: AuditListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  if (params.pageSize) qs.set("page_size", String(params.pageSize));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  appendMulti(qs, "action", params.action);
  appendMulti(qs, "entity_type", params.entityType);
  if (params.actor?.trim()) qs.set("actor", params.actor.trim());
  if (params.entityId) qs.set("entity_id", params.entityId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return qs.toString();
}

export async function listAudit(
  params: AuditListParams = {},
): Promise<AuditResult<AuditPage>> {
  const res = await request(`${AUDIT_ENDPOINT}?${buildQuery(params)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAuditPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getAudit(id: string): Promise<AuditResult<AuditEventDetail>> {
  const res = await request(`${AUDIT_ENDPOINT}/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAuditEventDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}

export async function getAuditSummary(): Promise<AuditResult<AuditSummary>> {
  const res = await request(AUDIT_SUMMARY_ENDPOINT);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAuditSummary(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status) };
}
