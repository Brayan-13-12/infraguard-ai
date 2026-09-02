"use client";

import { useTranslation } from "@/i18n";
import type { AssetSummary } from "@/types/asset";

import { KpiCard, type KpiTone } from "./KpiCard";

const n = (map: Record<string, number>, key: string) => map[key] ?? 0;

/**
 * The six headline counts, straight from {@link AssetSummary} (no extra
 * requests). Every card links into the matching Assets filter - the query
 * parameter names match `AssetsBrowser` exactly.
 */
export function KpiRow({ summary }: { summary: AssetSummary }) {
  const { t } = useTranslation();

  const items: Array<{
    label: string;
    value: number;
    href: string;
    hint: string;
    tone: KpiTone;
  }> = [
    {
      label: t("dashboard.kpi.total"),
      value: summary.total,
      href: "/assets",
      hint: t("dashboard.kpi.hints.total"),
      tone: "primary",
    },
    {
      label: t("dashboard.kpi.critical"),
      value: n(summary.by_criticality, "Critical"),
      href: "/assets?criticality=Critical",
      hint: t("dashboard.kpi.hints.critical"),
      tone: "danger",
    },
    {
      label: t("dashboard.kpi.operational"),
      value: n(summary.by_status, "Operational"),
      href: "/assets?status=Operational",
      hint: t("dashboard.kpi.hints.operational"),
      tone: "success",
    },
    {
      label: t("dashboard.kpi.degradedOffline"),
      value: n(summary.by_status, "Degraded") + n(summary.by_status, "Offline"),
      href: "/assets?status=Degraded&status=Offline",
      hint: t("dashboard.kpi.hints.degradedOffline"),
      tone: "warning",
    },
    {
      label: t("dashboard.kpi.maintenance"),
      value: n(summary.by_status, "Maintenance"),
      href: "/assets?status=Maintenance",
      hint: t("dashboard.kpi.hints.maintenance"),
      tone: "info",
    },
    {
      label: t("dashboard.kpi.inactive"),
      value: summary.inactive,
      href: "/assets?state=inactive",
      hint: t("dashboard.kpi.hints.inactive"),
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}
