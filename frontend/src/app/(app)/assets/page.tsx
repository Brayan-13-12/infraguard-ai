"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { AssetsBrowser } from "@/components/assets/AssetsBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function AssetsPage() {
  return (
    <RequirePermission permission="assets.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <AssetsBrowser />
      </Suspense>
    </RequirePermission>
  );
}
