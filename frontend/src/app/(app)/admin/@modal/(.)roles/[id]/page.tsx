"use client";

import { useParams } from "next/navigation";

import { AdminRoleWorkspace } from "@/components/admin/AdminDetailWorkspace";
import { RequirePermission } from "@/components/auth/RequirePermission";

/** Intercepting route for `/admin/roles/<id>`. */
export default function InterceptedAdminRole() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="roles.read">
      <AdminRoleWorkspace id={id} />
    </RequirePermission>
  );
}
