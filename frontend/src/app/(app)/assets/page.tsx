"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { AssetsWorkspace } from "@/components/assets/AssetsWorkspace";
import { Spinner } from "@/components/ui/Spinner";

export default function AssetsPage() {
  return (
    <RequirePermission anyOf={["assets.read", "relationships.read"]}>
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <AssetsWorkspace />
      </Suspense>
    </RequirePermission>
  );
}
