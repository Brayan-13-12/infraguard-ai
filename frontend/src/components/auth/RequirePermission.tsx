"use client";

import { useAuth } from "@/components/AuthProvider";
import { Forbidden } from "@/components/auth/Forbidden";
import { Spinner } from "@/components/ui/Spinner";
import type { Permission } from "@/lib/permissions";

/**
 * Client-side **module** guard. Renders `children` only when the authenticated
 * user holds the required permission(s); otherwise renders {@link Forbidden}.
 *
 * This is a UX convenience layered on top of {@link RequireAuth} - it hides a
 * screen the backend would reject anyway. Every guarded API call is enforced
 * server-side.
 *
 * Pass `permission` for a single capability or `anyOf` for "at least one of".
 */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: Permission | string;
  anyOf?: readonly (Permission | string)[];
  children: React.ReactNode;
}) {
  const { status, can, canAny } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex justify-center py-20">
        <Spinner decorative />
      </div>
    );
  }

  const allowed = anyOf ? canAny(anyOf) : permission ? can(permission) : true;
  return allowed ? <>{children}</> : <Forbidden />;
}
