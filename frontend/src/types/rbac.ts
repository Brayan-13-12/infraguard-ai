/**
 * User & Role administration types (RBAC - Phase 3).
 *
 * Permission *codes* are stable machine identifiers, never translated. The
 * network response is untrusted - every shape below has a runtime guard.
 */

import { PERMISSION_GROUPS, PERMISSIONS } from "@/lib/permissions";
import type { AccountStatus } from "@/types/auth";

export type { AccountStatus };

export interface RoleRef {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  account_status: AccountStatus;
  is_active: boolean;
  created_at: string;
  roles: RoleRef[];
}

export interface AdminUserPage {
  items: AdminUserListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  account_status: AccountStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: RoleRef[];
  permissions: string[];
  is_last_active_admin: boolean;
}

export interface RoleListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  user_count: number;
  permission_count: number;
}

export interface RolePage {
  items: RoleListItem[];
  total: number;
}

export interface RoleUserRef {
  id: string;
  email: string;
  is_active: boolean;
}

export interface RoleDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  permissions: string[];
  users: RoleUserRef[];
}

export interface PermissionRead {
  code: string;
  group: string;
  description: string;
}

export interface PermissionCatalog {
  groups: string[];
  permissions: PermissionRead[];
}

// --- runtime guards -------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isRoleRef(v: unknown): v is RoleRef {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.slug === "string" &&
    typeof v.is_system === "boolean"
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const ACCOUNT_STATUSES: readonly string[] = ["pending", "active", "rejected", "disabled"];
function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && ACCOUNT_STATUSES.includes(v);
}

export function isAdminUserListItem(v: unknown): v is AdminUserListItem {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    isAccountStatus(v.account_status) &&
    typeof v.is_active === "boolean" &&
    typeof v.created_at === "string" &&
    Array.isArray(v.roles) &&
    v.roles.every(isRoleRef)
  );
}

export function isAdminUserPage(v: unknown): v is AdminUserPage {
  if (!isRecord(v)) return false;
  return (
    Array.isArray(v.items) &&
    v.items.every(isAdminUserListItem) &&
    typeof v.page === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}

export function isAdminUserDetail(v: unknown): v is AdminUserDetail {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    isAccountStatus(v.account_status) &&
    typeof v.is_active === "boolean" &&
    Array.isArray(v.roles) &&
    v.roles.every(isRoleRef) &&
    isStringArray(v.permissions) &&
    typeof v.is_last_active_admin === "boolean"
  );
}

export function isRoleListItem(v: unknown): v is RoleListItem {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.slug === "string" &&
    typeof v.is_system === "boolean" &&
    typeof v.user_count === "number" &&
    typeof v.permission_count === "number"
  );
}

export function isRolePage(v: unknown): v is RolePage {
  if (!isRecord(v)) return false;
  return Array.isArray(v.items) && v.items.every(isRoleListItem) && typeof v.total === "number";
}

export function isRoleDetail(v: unknown): v is RoleDetail {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.slug === "string" &&
    typeof v.is_system === "boolean" &&
    isStringArray(v.permissions) &&
    Array.isArray(v.users)
  );
}

export function isPermissionCatalog(v: unknown): v is PermissionCatalog {
  if (!isRecord(v)) return false;
  return (
    isStringArray(v.groups) &&
    Array.isArray(v.permissions) &&
    v.permissions.every(
      (p) =>
        isRecord(p) &&
        typeof p.code === "string" &&
        typeof p.group === "string" &&
        typeof p.description === "string",
    )
  );
}

export function isRoleRefArray(v: unknown): v is RoleRef[] {
  return Array.isArray(v) && v.every(isRoleRef);
}

/** Split a code list into `{ group: codes[] }`, ordered by the catalog. */
export function groupPermissions(codes: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of PERMISSION_GROUPS) {
    const inGroup = PERMISSIONS.filter(
      (p) => p.startsWith(`${group}.`) && codes.includes(p),
    );
    if (inGroup.length) out[group] = inGroup;
  }
  return out;
}
