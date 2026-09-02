"use client";

import dynamic from "next/dynamic";

import { criticalityLabel } from "@/components/assets/catalog";
import { ChartCard } from "@/components/ui/chart/ChartCard";
import { CRITICALITY_COLORS } from "@/components/ui/chart/palette";
import type { ChartDatum } from "@/components/ui/chart/types";
import { PieChartIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTranslation } from "@/i18n";
import { CRITICALITIES, type AssetSummary } from "@/types/asset";

// Recharts is the only chart dependency; keep it out of the shared bundle.
const DonutChart = dynamic(
  () => import("@/components/ui/chart/DonutChart").then((m) => m.DonutChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Skeleton className="mx-auto h-44 w-44 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    ),
  },
);

/**
 * The single primary Dashboard visualization: assets by criticality. Criticality
 * is the strongest immediate infrastructure-risk signal, so it earns the one
 * chart slot and the level-1 surface. Semantic severity colours only. Each
 * slice / legend row drills into the filtered Assets list.
 */
export function CriticalityChart({ summary }: { summary: AssetSummary }) {
  const { t } = useTranslation();

  const data: ChartDatum[] = CRITICALITIES.map((k) => ({
    key: k,
    label: criticalityLabel(t, k),
    value: summary.by_criticality[k] ?? 0,
    color: CRITICALITY_COLORS[k] ?? "hsl(var(--primary))",
    href: `/assets?criticality=${encodeURIComponent(k)}`,
  }));

  return (
    <ChartCard
      title={t("dashboard.charts.criticalityTitle")}
      icon={PieChartIcon}
      accent
      elevated
      glow
    >
      <DonutChart
        data={data}
        caption={t("dashboard.charts.tableCaption", {
          title: t("dashboard.charts.criticalityTitle"),
        })}
        centerLabel={{ value: summary.total, text: t("dashboard.charts.centerUnit") }}
      />
    </ChartCard>
  );
}
