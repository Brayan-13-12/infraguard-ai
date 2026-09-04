"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { DependenciesBrowser } from "@/components/dependencies/DependenciesBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function DependenciesPage() {
  return (
    <RequirePermission permission="relationships.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <DependenciesBrowser />
      </Suspense>
    </RequirePermission>
  );
}
