"use client";

import { Suspense } from "react";

import { AuditBrowser } from "@/components/audit/AuditBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner decorative />
        </div>
      }
    >
      <AuditBrowser />
    </Suspense>
  );
}
