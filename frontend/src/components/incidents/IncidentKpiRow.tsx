"use client";

import { useTranslation, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/cn";
import type { IncidentSummary } from "@/types/incident";

export type IncidentKpiKey =
  | "open"
  | "critical"
  | "investigating"
  | "monitoring"
  | "resolvedRecently";

interface KpiDef {
  key: IncidentKpiKey;
  labelKey: TranslationKey;
  value: (s: IncidentSummary) => number;
  tone: string;
}

const KPIS: KpiDef[] = [
  { key: "open", labelKey: "incidents.kpi.open", value: (s) => s.open, tone: "text-info" },
  {
    key: "critical",
    labelKey: "incidents.kpi.critical",
    value: (s) => s.critical_open,
    tone: "text-danger",
  },
  {
    key: "investigating",
    labelKey: "incidents.kpi.investigating",
    value: (s) => s.investigating,
    tone: "text-warning",
  },
  {
    key: "monitoring",
    labelKey: "incidents.kpi.monitoring",
    value: (s) => s.monitoring,
    tone: "text-caution",
  },
  {
    key: "resolvedRecently",
    labelKey: "incidents.kpi.resolvedRecently",
    value: (s) => s.resolved_recently,
    tone: "text-success",
  },
];

/**
 * Compact operational overview - five small interactive stats (not giant KPI
 * cards). Clicking one applies the matching list filter.
 */
export function IncidentKpiRow({
  summary,
  activeKey,
  onSelect,
}: {
  summary: IncidentSummary;
  activeKey: IncidentKpiKey | null;
  onSelect: (key: IncidentKpiKey) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {KPIS.map((kpi) => {
        const active = activeKey === kpi.key;
        return (
          <button
            key={kpi.key}
            type="button"
            onClick={() => onSelect(kpi.key)}
            aria-pressed={active}
            className={cn(
              "flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-[background-color,border-color,transform] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:active:scale-100",
              active
                ? "border-primary/40 bg-primary/[0.06]"
                : "border-border bg-surface hover:border-muted-foreground/40 hover:bg-muted/30",
            )}
          >
            <span className={cn("text-lg font-semibold tabular-nums", kpi.tone)}>
              {kpi.value(summary)}
            </span>
            <span className="text-xs text-muted-foreground">{t(kpi.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
