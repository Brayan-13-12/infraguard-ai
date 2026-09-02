"use client";

import { useCallback, useEffect, useState } from "react";

import { StatusIndicator } from "@/components/StatusIndicator";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";
import { Dialog } from "@/components/ui/overlay";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { fetchBackendHealth } from "@/services/health";
import type { ComponentState, SystemHealth } from "@/types/health";

const INITIAL: SystemHealth = {
  frontend: { kind: "operational" },
  backend: { kind: "loading" },
  database: { kind: "loading" },
};

type Rollup = "operational" | "degraded" | "checking";

function rollup(h: SystemHealth): Rollup {
  const kinds = [h.frontend.kind, h.backend.kind, h.database.kind];
  if (kinds.includes("loading")) return "checking";
  if (kinds.every((k) => k === "operational")) return "operational";
  return "degraded";
}

/**
 * Compact system-health cue near the page header (e.g. "● Sistema operativo").
 * Clicking opens a small dialog with the real per-component status from the
 * backend health endpoint. Replaces the large dashboard health panel.
 */
export function SystemStatusIndicator({ refreshToken = 0 }: { refreshToken?: number }) {
  const { t, language } = useTranslation();
  const [health, setHealth] = useState<SystemHealth>(INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setHealth((h) => ({ ...h, backend: { kind: "loading" }, database: { kind: "loading" } }));
    const result = await fetchBackendHealth();
    let next: Pick<SystemHealth, "backend" | "database">;
    if (result.ok) {
      const database: ComponentState =
        result.data.database === "healthy"
          ? { kind: "operational" }
          : { kind: "down", detail: t("systemHealth.details.dbCheckFailed") };
      next = { backend: { kind: "operational" }, database };
    } else if (result.reason === "unreachable") {
      next = {
        backend: { kind: "down", detail: t("systemHealth.details.backendUnreachable") },
        database: {
          kind: "unknown",
          detail: t("systemHealth.details.backendUnreachableShort"),
        },
      };
    } else {
      next = {
        backend: { kind: "unknown", detail: t("systemHealth.details.backendUnreadable") },
        database: { kind: "unknown", detail: t("systemHealth.details.backendUnreadable") },
      };
    }
    setHealth((h) => ({ ...h, ...next }));
    setCheckedAt(new Date());
    setRefreshing(false);
  }, [t]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when the dashboard's "Actualizar" is pressed.
  useEffect(() => {
    if (refreshToken > 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const state = rollup(health);
  const dot =
    state === "operational" ? "bg-success" : state === "degraded" ? "bg-danger" : "bg-warning";
  const labelKey =
    state === "operational"
      ? "dashboard.health.operational"
      : state === "degraded"
        ? "dashboard.health.degraded"
        : "dashboard.health.checking";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("dashboard.health.viewDetails")}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 rounded-full",
            dot,
            state === "checking" && "animate-pulse motion-reduce:animate-none",
          )}
        />
        {t(labelKey)}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("dashboard.health.dialogTitle")}
        description={t("systemHealth.subtitle")}
        size="sm"
      >
        <ul className="flex flex-col gap-2">
          <StatusIndicator name={t("systemHealth.frontend")} state={health.frontend} />
          <StatusIndicator name={t("systemHealth.backend")} state={health.backend} />
          <StatusIndicator name={t("systemHealth.database")} state={health.database} />
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {checkedAt
              ? t("systemHealth.lastChecked", {
                  time: checkedAt.toLocaleTimeString(LANGUAGE_LOCALES[language]),
                })
              : t("systemHealth.contacting")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void refresh()} loading={refreshing}>
            {!refreshing && <RefreshIcon />}
            {refreshing ? t("common.refreshing") : t("common.refresh")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
