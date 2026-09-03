import { useMemo } from "react";

import { AuthContextInternal, type AuthContextValue } from "@/components/AuthProvider";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from "@/lib/permissions";
import type { User } from "@/types/auth";

import { makeUser } from "./fixtures";

/**
 * Synchronous auth context for component tests - no `fetchMe`, no `AuthProvider`
 * async lifecycle. Defaults to an Administrator (every permission) so the
 * existing browser / detail suites keep exercising the full UI; pass `user`
 * (e.g. `VIEWER_USER`) to scope a session.
 */
export function MockAuthProvider({
  children,
  user = makeUser(),
}: {
  children: React.ReactNode;
  user?: User | null;
}) {
  const value = useMemo<AuthContextValue>(() => {
    const permissions = user?.permissions ?? [];
    return {
      user,
      status: user ? "authenticated" : "unauthenticated",
      error: null,
      permissions,
      can: (code) => hasPermission(permissions, code),
      canAny: (codes) => hasAnyPermission(permissions, codes),
      canAll: (codes) => hasAllPermissions(permissions, codes),
      refresh: async () => {},
      login: async () => ({ ok: true, data: user ?? makeUser() }),
      register: async () => ({
        ok: true,
        data: { account_status: "pending", detail: "" },
      }),
      logout: async () => ({ ok: true }),
    };
  }, [user]);

  return (
    <AuthContextInternal.Provider value={value}>{children}</AuthContextInternal.Provider>
  );
}
