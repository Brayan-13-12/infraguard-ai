import { API_BASE_URL } from "@/lib/config";
import {
  isAdminUserDetail,
  isAdminUserPage,
  isPermissionCatalog,
  isRoleDetail,
  isRolePage,
  isRoleRefArray,
  type AdminUserDetail,
  type AdminUserPage,
  type PermissionCatalog,
  type RoleDetail,
  type RolePage,
  type RoleRef,
} from "@/types/rbac";

const ADMIN = `${API_BASE_URL}/api/v1/admin`;
const REQUEST_TIMEOUT_MS = 8000;

export type AdminErrorKind =
  | "unreachable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unexpected";

export interface AdminError {
  kind: AdminErrorKind;
  /** Server-supplied message for `conflict` / `validation` (already safe text). */
  message?: string;
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: AdminError };

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

function detailText(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return undefined;
}

function errorFor(status: number, body: unknown): AdminError {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  if (status === 409) return { kind: "conflict", message: detailText(body) };
  if (status === 422) return { kind: "validation", message: detailText(body) };
  return { kind: "unexpected" };
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// --- Permissions ---------------------------------------------------------

export async function getPermissionCatalog(): Promise<AdminResult<PermissionCatalog>> {
  const res = await request(`${ADMIN}/permissions`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isPermissionCatalog(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

// --- Users --------------------------------------------------------------

export interface AdminUserListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  /** Lifecycle filter: `pending` | `active` | `rejected` | `disabled`. */
  status?: string;
  role?: string;
}

export async function listUsers(
  params: AdminUserListParams = {},
): Promise<AdminResult<AdminUserPage>> {
  const query = toQuery({
    page: params.page ?? 1,
    page_size: params.pageSize,
    q: params.q?.trim(),
    status: params.status,
    role: params.role,
  });
  const res = await request(`${ADMIN}/users${query}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

/** Pending access requests (newest first). */
export async function listAccessRequests(
  params: { page?: number; pageSize?: number; q?: string } = {},
): Promise<AdminResult<AdminUserPage>> {
  const query = toQuery({
    page: params.page ?? 1,
    page_size: params.pageSize,
    q: params.q?.trim(),
  });
  const res = await request(`${ADMIN}/access-requests${query}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

/** Approve a pending / rejected request: assigns roles and activates. */
export async function approveUser(
  id: string,
  roleIds: string[],
): Promise<AdminResult<AdminUserDetail>> {
  const res = await request(`${ADMIN}/users/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify({ role_ids: roleIds }),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

/** Reject a pending request (kept in history, not deleted). */
export async function rejectUser(id: string): Promise<AdminResult<AdminUserDetail>> {
  const res = await request(`${ADMIN}/users/${encodeURIComponent(id)}/reject`, {
    method: "POST",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getUser(id: string): Promise<AdminResult<AdminUserDetail>> {
  const res = await request(`${ADMIN}/users/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<AdminResult<AdminUserDetail>> {
  const res = await request(`${ADMIN}/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function setUserRoles(
  id: string,
  roleIds: string[],
): Promise<AdminResult<AdminUserDetail>> {
  const res = await request(`${ADMIN}/users/${encodeURIComponent(id)}/roles`, {
    method: "PUT",
    body: JSON.stringify({ role_ids: roleIds }),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAdminUserDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

// --- Roles -------------------------------------------------------------

export async function listRoles(): Promise<AdminResult<RolePage>> {
  const res = await request(`${ADMIN}/roles`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRolePage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

/** Role refs for the "manage roles" selector (reuses the roles list). */
export async function listRoleRefs(): Promise<AdminResult<RoleRef[]>> {
  const res = await listRoles();
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.items.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      is_system: r.is_system,
    })),
  };
}

export async function getRole(id: string): Promise<AdminResult<RoleDetail>> {
  const res = await request(`${ADMIN}/roles/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRoleDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<AdminResult<RoleDetail>> {
  const res = await request(`${ADMIN}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description || null,
      permissions: input.permissions,
    }),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 201 && isRoleDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<AdminResult<RoleDetail>> {
  const res = await request(`${ADMIN}/roles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRoleDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function setRolePermissions(
  id: string,
  permissions: string[],
): Promise<AdminResult<RoleDetail>> {
  const res = await request(`${ADMIN}/roles/${encodeURIComponent(id)}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isRoleDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function deleteRole(id: string): Promise<AdminResult<null>> {
  const res = await request(`${ADMIN}/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200) return { ok: true, data: null };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export { isRoleRefArray };
