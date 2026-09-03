import { PERMISSIONS } from "@/lib/permissions";
import type { RoleRef, User } from "@/types/auth";

const ADMIN_ROLE: RoleRef = {
  id: "role-admin",
  name: "Administrator",
  slug: "administrator",
};

const VIEWER_ROLE: RoleRef = {
  id: "role-viewer",
  name: "Viewer",
  slug: "viewer",
};

/**
 * Test user factory. Defaults to an Administrator (every permission) so existing
 * shell / dashboard tests keep exercising the full navigation. Pass
 * `permissions` / `roles` to scope a session.
 */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@example.com",
    is_active: true,
    account_status: "active",
    created_at: "2026-08-31T00:00:00Z",
    roles: [ADMIN_ROLE],
    permissions: [...PERMISSIONS],
    ...overrides,
  };
}

export const VIEWER_USER: User = makeUser({
  email: "viewer@example.com",
  roles: [VIEWER_ROLE],
  permissions: ["assets.read", "incidents.read"],
});
