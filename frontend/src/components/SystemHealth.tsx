"use client";

import { useCallback, useEffect, useState } from "react";

import { StatusIndicator } from "@/components/StatusIndicator";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";
import { useTranslation, LANGUAGE_LOCALES } from "@/i18n";
import { fetchBackendHealth } from "@/services/health";
import type { ComponentState, SystemHealth } from "@/types/health";

const INITIAL: SystemHealth = {
  // The page rendered in the browser, so the frontend itself is operational.
  frontend: { kind: "operational" },
  backend: { kind: "loading" },
  database: { kind: "loading" },
};

export function SystemHealthPanel({ className }: { className?: string }) {
  const { t, language } = useTranslation();
  const [health, setHealth] = useState<SystemHealth>(INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setHealth((h) => ({ ...h, backend: { kind: "loading" }, database: { kind: "loading" } }));

    const result = await fetchBackendHealth();
    let next: Pick<SystemHealth, "backend" | "database">;

    if (result.ok) {
      const backend: ComponentState = { kind: "operational" };
      const database: ComponentState =
        result.data.database === "healthy"
          ? { kind: "operational" }
          : { kind: "down", detail: t("systemHealth.details.dbCheckFailed") };
      next = { backend, database };
    } else if (result.reason === "unreachable") {
      next = {
        backend: { kind: "down", detail: t("systemHealth.details.backendUnreachable") },
        database: { kind: "unknown", detail: t("systemHealth.details.backendUnreachableShort") },
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
    // Run once on mount; language changes should not re-hit the backend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      aria-labelledby="system-health-heading"
      className={
        "rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6 " + (className ?? "")
      }
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 id="system-health-heading" className="text-base font-semibold text-foreground">
            {t("systemHealth.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("systemHealth.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          loading={refreshing}
        >
          {!refreshing && <RefreshIcon />}
          {refreshing ? t("common.refreshing") : t("common.refresh")}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        <StatusIndicator name={t("systemHealth.frontend")} state={health.frontend} />
        <StatusIndicator name={t("systemHealth.backend")} state={health.backend} />
        <StatusIndicator name={t("systemHealth.database")} state={health.database} />
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        {checkedAt
          ? t("systemHealth.lastChecked", {
              time: checkedAt.toLocaleTimeString(LANGUAGE_LOCALES[language]),
            })
          : t("systemHealth.contacting")}
      </p>
    </section>
  );
}
