"use client";

import { Suspense } from "react";

import { IncidentsBrowser } from "@/components/incidents/IncidentsBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function IncidentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner decorative />
        </div>
      }
    >
      <IncidentsBrowser />
    </Suspense>
  );
}
