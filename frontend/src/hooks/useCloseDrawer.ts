"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Close an intercepted-route drawer. Prefers `router.back()` so the exact
 * `/assets` state (filters, page, search, scroll) is restored from history;
 * falls back to a replace when there is no history entry to return to (e.g. the
 * drawer route was somehow the first entry).
 */
export function useCloseDrawer(fallback = "/assets"): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [router, fallback]);
}
