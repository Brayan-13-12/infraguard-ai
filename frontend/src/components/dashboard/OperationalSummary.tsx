"use client";

import Link from "next/link";

import {
  assetTypeLabel,
  environmentLabel,
  statusLabel,
} from "@/components/assets/catalog";
import { Card } from "@/components/ui/Card";
import { ActivityIcon, ArrowRightIcon, BoxIcon, NetworkIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type {
  AssetStatus,
  AssetSummary,
  AssetType,
  Environment,
} from "@/types/asset";

const STATUS_ROWS: Array<{ key: AssetStatus; dot: string; bar: string }> = [
  { key: "Operational", dot: "bg-success", bar: "bg-success/40 group-hover:bg-success/70" },
  { key: "Degraded", dot: "bg-warning", bar: "bg-warning/40 group-hover:bg-warning/70" },
  { key: "Offline", dot: "bg-danger", bar: "bg-danger/40 group-hover:bg-danger/70" },
  { key: "Maintenance", dot: "bg-info", bar: "bg-info/40 group-hover:bg-info/70" },
];

function topEntry(map: Record<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(map)) {
    if (v > 0 && (best === null || v > best[1])) best = [k, v];
  }
  return best;
}

/**
 * The operational counterpart to the criticality chart - concise data, not a
 * second chart. Interactive status rows (each links into Assets) with thin
 * proportional bars, plus a visually distinct insight strip for the top
 * environment / type.
 */
export function OperationalSummary({ summary }: { summary: AssetSummary }) {
  const { t } = useTranslation();
  const total = summary.total || 1;

  const topEnv = topEntry(summary.by_environment);
  const topType = topEntry(summary.by_type);
  const assetsCount = (v: number) =>
    v === 1 ? t("assets.countOne") : t("dashboard.insight.assets", { count: v });

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ActivityIcon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("dashboard.operational.title")}
        </h3>
      </div>

      <ul className="flex flex-col gap-1">
        {STATUS_ROWS.map(({ key, dot, bar }) => {
          const count = summary.by_status[key] ?? 0;
          const pct = Math.round((count / total) * 100);
          return (
            <li key={key}>
              <Link
                href={`/assets?status=${encodeURIComponent(key)}`}
                aria-label={t("dashboard.operational.viewFiltered", {
                  label: statusLabel(t, key),
                })}
                className="group -mx-2 block rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dot)} />
                    {statusLabel(t, key)}
                    <ArrowRightIcon className="h-3 w-3 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{count}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-colors", bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <NetworkIcon className="h-3.5 w-3.5" />
            {t("dashboard.insight.topEnvironment")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {topEnv ? environmentLabel(t, topEnv[0] as Environment) : "—"}
          </p>
          {topEnv ? (
            <p className="text-xs tabular-nums text-muted-foreground">{assetsCount(topEnv[1])}</p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <BoxIcon className="h-3.5 w-3.5" />
            {t("dashboard.insight.topType")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {topType ? assetTypeLabel(t, topType[0] as AssetType) : "—"}
          </p>
          {topType ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {assetsCount(topType[1])}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
