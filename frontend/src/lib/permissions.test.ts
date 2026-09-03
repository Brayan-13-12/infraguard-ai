import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  PERMISSION_GROUPS,
  PERMISSIONS,
} from "@/lib/permissions";

describe("permission helpers", () => {
  const granted = ["assets.read", "incidents.read", "audit.read"];

  it("hasPermission is a plain membership check", () => {
    expect(hasPermission(granted, "assets.read")).toBe(true);
    expect(hasPermission(granted, "assets.create")).toBe(false);
  });

  it("hasAnyPermission is true when at least one is granted", () => {
    expect(hasAnyPermission(granted, ["assets.create", "audit.read"])).toBe(true);
    expect(hasAnyPermission(granted, ["assets.create", "users.manage"])).toBe(false);
    expect(hasAnyPermission([], ["assets.read"])).toBe(false);
  });

  it("hasAllPermissions requires every code", () => {
    expect(hasAllPermissions(granted, ["assets.read", "audit.read"])).toBe(true);
    expect(hasAllPermissions(granted, ["assets.read", "assets.create"])).toBe(false);
  });

  it("ADMIN_PERMISSIONS is exactly the user/role admin capabilities", () => {
    expect(new Set(ADMIN_PERMISSIONS)).toEqual(
      new Set(["users.read", "users.manage", "roles.read", "roles.manage"]),
    );
  });

  it("every permission code belongs to a known group", () => {
    for (const code of PERMISSIONS) {
      const group = code.split(".")[0];
      expect(PERMISSION_GROUPS).toContain(group);
    }
  });

  it("does not expose a purge permission this milestone", () => {
    expect(PERMISSIONS).not.toContain("trash.purge");
  });
});
