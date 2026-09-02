"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { getAssetSummary } from "@/services/assets";
import { cn } from "@/lib/cn";
import type { AssetSummary } from "@/types/asset";

import { CriticalityChart } from "./CriticalityChart";
import { KpiRow } from "./KpiRow";
import { OperationalSummary } from "./OperationalSummary";
import { RecentAssets } from "./RecentAssets";
import { SystemStatusIndicator } from "./SystemStatusIndicator";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; summary: AssetSummary }
  | { kind: "error" };

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[5.5rem]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}

/**
 * The operational dashboard: real KPI counts + one criticality chart from
 * `GET /api/v1/assets/summary` (one request), a concise operational summary, and
 * recently updated assets. "Actualizar" really refetches the summary, the
 * recent list and the health check.
 */
export function DashboardOverview() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const name = user?.email?.split("@")[0];

  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const hadData = useRef(false);

  const fetchSummary = useCallback(
    (mode: "initial" | "refresh") => {
      let cancelled = false;
      if (mode === "refresh") setRefreshing(true);
      else setState({ kind: "loading" });

      void getAssetSummary().then((res) => {
        if (cancelled) return;
        setRefreshing(false);
        if (res.ok) {
          hadData.current = true;
          setState({ kind: "loaded", summary: res.data });
          setRefreshedAt(new Date());
        } else if (mode === "refresh" && hadData.current) {
          // Keep the stale board; surface the failure without blowing it away.
          toast({ tone: "danger", description: t("dashboard.refreshFailed") });
        } else {
          setState({ kind: "error" });
        }
      });

      return () => {
        cancelled = true;
      };
    },
    [t],
  );

  useEffect(() => fetchSummary("initial"), [fetchSummary]);

  const refresh = () => {
    setRefreshToken((n) => n + 1); // recent assets + health refetch
    fetchSummary("refresh");
  };

  const retry = () => fetchSummary("initial");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        // Product page name - always English, like the sidebar nav label.
        title="Dashboard"
        description={name ? t("dashboard.welcome", { name }) : t("dashboard.welcomeNoName")}
        actions={
          <>
            {refreshedAt ? (
              <span className="hidden text-xs tabular-nums text-muted-foreground md:inline">
                {t("dashboard.refreshedAt", {
                  time: refreshedAt.toLocaleTimeString(LANGUAGE_LOCALES[language], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </span>
            ) : null}
            <SystemStatusIndicator refreshToken={refreshToken} />
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
              loading={refreshing}
              disabled={state.kind === "loading"}
            >
              {!refreshing ? <RefreshIcon /> : null}
              <span className={cn(refreshing ? "sm:inline" : "hidden sm:inline")}>
                {refreshing ? t("common.refreshing") : t("common.refresh")}
              </span>
            </Button>
          </>
        }
      />

      {state.kind === "loading" ? (
        <OverviewSkeleton />
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("dashboard.loadError")}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <Reveal>
            <KpiRow summary={state.summary} />
          </Reveal>
          <Reveal
            delayMs={60}
            className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start"
          >
            <CriticalityChart summary={state.summary} />
            <OperationalSummary summary={state.summary} />
          </Reveal>
          <Reveal delayMs={120}>
            <RecentAssets refreshToken={refreshToken} />
          </Reveal>
        </div>
      )}
    </div>
  );
}
