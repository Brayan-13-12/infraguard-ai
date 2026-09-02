"use client";

import { Suspense } from "react";

import { AssetsBrowser } from "@/components/assets/AssetsBrowser";
import { Spinner } from "@/components/ui/Spinner";

export default function AssetsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner decorative />
        </div>
      }
    >
      <AssetsBrowser />
    </Suspense>
  );
}
