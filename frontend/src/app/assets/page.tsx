"use client";

import { Suspense } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { AssetsBrowser } from "@/components/assets/AssetsBrowser";
import { AppShell } from "@/components/shell/AppShell";
import { Spinner } from "@/components/ui/Spinner";

export default function AssetsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Suspense
          fallback={
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          }
        >
          <AssetsBrowser />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
