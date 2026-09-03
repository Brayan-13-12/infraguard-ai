"use client";

import { Suspense } from "react";

import { TrashBrowser } from "@/components/trash/TrashBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function TrashPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner decorative />
        </div>
      }
    >
      <TrashBrowser />
    </Suspense>
  );
}
