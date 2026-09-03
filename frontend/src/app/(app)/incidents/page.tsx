"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { IncidentsBrowser } from "@/components/incidents/IncidentsBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function IncidentsPage() {
  return (
    <RequirePermission permission="incidents.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <IncidentsBrowser />
      </Suspense>
    </RequirePermission>
  );
}
