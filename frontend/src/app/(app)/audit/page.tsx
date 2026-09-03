"use client";

import { Suspense } from "react";

import { AuditBrowser } from "@/components/audit/AuditBrowser";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { Spinner } from "@/components/ui/Spinner";

export default function AuditPage() {
  return (
    <RequirePermission permission="audit.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <AuditBrowser />
      </Suspense>
    </RequirePermission>
  );
}
