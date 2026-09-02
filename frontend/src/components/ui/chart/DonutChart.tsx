"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

import { ChartDataTable } from "./ChartDataTable";
import type { ChartDatum } from "./types";

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  total: number;
}) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
  return (
    <div className="rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs shadow-md">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-[3px]"
          style={{ background: d.color }}
        />
        {d.label}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {d.value} · {t("dashboard.charts.shareOfTotal", { percent: pct })}
      </p>
      {d.href ? (
        <p className="mt-0.5 text-[11px] text-primary">{t("dashboard.charts.clickToFilter")}</p>
      ) : null}
    </div>
  );
}

/**
 * Donut + integrated legend/companion table. The SVG is decorative
 * (`aria-hidden`); the table carries labels, counts, percentages and
 * keyboard-navigable drill-down links. Hovering a segment or a legend row
 * cross-highlights the other. Animation is disabled under reduced motion.
 */
export function DonutChart({
  data,
  caption,
  centerLabel,
  className,
}: {
  data: ChartDatum[];
  caption: string;
  /** Big number + unit shown in the ring centre (e.g. total + "activos"). */
  centerLabel?: { value: number | string; text: string };
  className?: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const total = data.reduce((acc, d) => acc + d.value, 0);
  const animate = !prefersReducedMotion();
  const nonEmpty = data.filter((d) => d.value > 0);

  const active = activeKey ? data.find((d) => d.key === activeKey) : undefined;
  const centerValue = active ? active.value : (centerLabel?.value ?? total);
  const centerText = active ? active.label : (centerLabel?.text ?? "");

  return (
    <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-center", className)}>
      <div
        className="relative mx-auto h-44 w-44 shrink-0"
        aria-hidden="true"
        onMouseLeave={() => setActiveKey(null)}
      >
        {total > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={nonEmpty}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="72%"
                  outerRadius="100%"
                  paddingAngle={nonEmpty.length > 1 ? 1.5 : 0}
                  cornerRadius={3}
                  strokeWidth={0}
                  isAnimationActive={animate}
                  onMouseEnter={(_, index) =>
                    setActiveKey(nonEmpty[index]?.key ?? null)
                  }
                  onClick={(entry: { href?: string }) => {
                    if (entry?.href) router.push(entry.href);
                  }}
                >
                  {nonEmpty.map((d) => (
                    <Cell
                      key={d.key}
                      fill={d.color}
                      fillOpacity={activeKey && activeKey !== d.key ? 0.32 : 1}
                      className={cn(
                        "outline-none transition-opacity",
                        d.href && "cursor-pointer",
                      )}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<DonutTooltip total={total} />}
                  wrapperStyle={{ outline: "none" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <span className="text-3xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
                {centerValue}
              </span>
              <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                {centerText}
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
            {t("dashboard.charts.empty")}
          </div>
        )}
      </div>

      <ChartDataTable
        data={data}
        caption={caption}
        total={total}
        activeKey={activeKey}
        onRowHover={setActiveKey}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
