"use client";

import { Suspense } from "react";

import { AdminBrowser } from "@/components/admin/AdminBrowser";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { Spinner } from "@/components/ui/Spinner";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

export default function AdminPage() {
  return (
    <RequirePermission anyOf={ADMIN_PERMISSIONS}>
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <AdminBrowser />
      </Suspense>
    </RequirePermission>
  );
}
