"use client";

import { useParams } from "next/navigation";

import { AdminUserWorkspace } from "@/components/admin/AdminDetailWorkspace";
import { RequirePermission } from "@/components/auth/RequirePermission";

/** Intercepting route for `/admin/users/<id>` - a route-aware workspace over the
 *  still-mounted Administration list. */
export default function InterceptedAdminUser() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="users.read">
      <AdminUserWorkspace id={id} />
    </RequirePermission>
  );
}
