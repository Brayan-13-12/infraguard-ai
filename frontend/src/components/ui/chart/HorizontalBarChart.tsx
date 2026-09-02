"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

import { ChartDataTable } from "./ChartDataTable";
import type { ChartDatum } from "./types";

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground">{d.label}</p>
      <p className="text-muted-foreground">{d.value}</p>
      {d.href ? (
        <p className="mt-0.5 text-[11px] text-primary">{t("dashboard.charts.clickToFilter")}</p>
      ) : null}
    </div>
  );
}

/**
 * Horizontal bar chart + accessible companion table. SVG is decorative; the
 * table carries labels, counts, percentages and drill-down links.
 */
export function HorizontalBarChart({
  data,
  caption,
  className,
}: {
  data: ChartDatum[];
  caption: string;
  className?: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const animate = !prefersReducedMotion();
  const height = Math.max(120, data.length * 34);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div aria-hidden="true" style={{ height }}>
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              barCategoryGap={6}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                content={<BarTooltip />}
                wrapperStyle={{ outline: "none" }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                isAnimationActive={animate}
                onClick={(entry: { href?: string }) => {
                  if (entry?.href) router.push(entry.href);
                }}
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.color}
                    className={d.href ? "cursor-pointer outline-none" : "outline-none"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            {t("dashboard.charts.empty")}
          </div>
        )}
      </div>

      <ChartDataTable data={data} caption={caption} total={total} />
    </div>
  );
}
