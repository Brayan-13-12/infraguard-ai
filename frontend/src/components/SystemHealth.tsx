"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchBackendHealth } from "@/services/health";
import type { ComponentState, SystemHealth } from "@/types/health";
import { StatusIndicator } from "./StatusIndicator";

const INITIAL: SystemHealth = {
  // The page rendered in the browser, so the frontend itself is operational.
  frontend: { kind: "operational" },
  backend: { kind: "loading" },
  database: { kind: "loading" },
};

function deriveState(): Promise<Pick<SystemHealth, "backend" | "database">> {
  return fetchBackendHealth().then((result): Pick<SystemHealth, "backend" | "database"> => {
    if (result.ok) {
      const backend: ComponentState = { kind: "operational" };
      const database: ComponentState =
        result.data.database === "healthy"
          ? { kind: "operational" }
          : { kind: "down", detail: "PostgreSQL connectivity check failed" };
      return { backend, database };
    }

    if (result.reason === "unreachable") {
      return {
        backend: { kind: "down", detail: result.detail },
        database: { kind: "unknown", detail: "Backend unreachable" },
      };
    }

    // bad-status / malformed
    return {
      backend: { kind: "unknown", detail: result.detail },
      database: { kind: "unknown", detail: "Backend response could not be read" },
    };
  });
}

export function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealth>(INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setHealth((h) => ({ ...h, backend: { kind: "loading" }, database: { kind: "loading" } }));
    const next = await deriveState();
    setHealth((h) => ({ ...h, ...next }));
    setCheckedAt(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section
      aria-labelledby="system-health-heading"
      className="w-full max-w-xl rounded-xl border border-slate-200 bg-slate-100/60 p-5 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="system-health-heading" className="text-lg font-semibold">
          System health
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium transition hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        <StatusIndicator name="Frontend" state={health.frontend} />
        <StatusIndicator name="Backend API" state={health.backend} />
        <StatusIndicator name="PostgreSQL Database" state={health.database} />
      </ul>

      <p className="mt-3 text-xs text-slate-400">
        {checkedAt
          ? `Last checked ${checkedAt.toLocaleTimeString()}`
          : "Contacting backend…"}
      </p>
    </section>
  );
}
