"use client";

import { useParams } from "next/navigation";

import { AdminRoleDetailPage } from "@/components/admin/AdminDetailPage";
import { RequirePermission } from "@/components/auth/RequirePermission";

export default function AdminRolePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="roles.read">
      <AdminRoleDetailPage id={id} />
    </RequirePermission>
  );
}
