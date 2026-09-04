/**
 * Permission codes - the **stable machine identifiers** the backend enforces.
 * Never translated (a Spanish label lives next to the code in the UI).
 *
 * Frontend visibility is NOT security: these strings only let the UI hide a
 * control the API would reject anyway. Every guarded action is enforced in the
 * backend (see backend/app/services/rbac.py).
 */

export const PERMISSIONS = [
  "assets.read",
  "assets.create",
  "assets.update",
  "assets.delete",
  "incidents.read",
  "incidents.create",
  "incidents.update",
  "incidents.resolve",
  "incidents.delete",
  "audit.read",
  "trash.read",
  "trash.restore",
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "ai.use",
  "relationships.read",
  "relationships.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Ordered permission groups for the role permission-matrix editor. */
export const PERMISSION_GROUPS = [
  "assets",
  "incidents",
  "audit",
  "trash",
  "users",
  "roles",
  "ai",
  "relationships",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

/** Permissions that make the Administration module reachable. */
export const ADMIN_PERMISSIONS: Permission[] = [
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
];

export function hasPermission(
  granted: readonly string[],
  code: Permission | string,
): boolean {
  return granted.includes(code);
}

export function hasAnyPermission(
  granted: readonly string[],
  codes: readonly (Permission | string)[],
): boolean {
  return codes.some((c) => granted.includes(c));
}

export function hasAllPermissions(
  granted: readonly string[],
  codes: readonly (Permission | string)[],
): boolean {
  return codes.every((c) => granted.includes(c));
}
