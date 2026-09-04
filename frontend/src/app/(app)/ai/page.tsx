"use client";

import { Suspense } from "react";

import { AiWorkspace } from "@/components/ai/AiWorkspace";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { Spinner } from "@/components/ui/Spinner";

export default function AiAssistantPage() {
  return (
    <RequirePermission permission="ai.use">
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Spinner decorative />
          </div>
        }
      >
        <AiWorkspace />
      </Suspense>
    </RequirePermission>
  );
}
