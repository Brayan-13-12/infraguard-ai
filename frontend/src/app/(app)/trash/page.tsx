"use client";

import { Suspense } from "react";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { TrashBrowser } from "@/components/trash/TrashBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function TrashPage() {
  return (
    <RequirePermission permission="trash.read">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <TrashBrowser />
      </Suspense>
    </RequirePermission>
  );
}
