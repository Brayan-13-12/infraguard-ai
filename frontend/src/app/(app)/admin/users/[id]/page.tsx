"use client";

import { useParams } from "next/navigation";

import { AdminUserDetailPage } from "@/components/admin/AdminDetailPage";
import { RequirePermission } from "@/components/auth/RequirePermission";

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="users.read">
      <AdminUserDetailPage id={id} />
    </RequirePermission>
  );
}
