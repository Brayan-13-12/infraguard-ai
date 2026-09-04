"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { Spinner } from "@/components/ui/Spinner";
import { TopologyWorkspace } from "@/components/topology/TopologyWorkspace";

export default function TopologyPage() {
  return (
    <RequirePermission permission="relationships.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <TopologyWorkspace />
      </Suspense>
    </RequirePermission>
  );
}
