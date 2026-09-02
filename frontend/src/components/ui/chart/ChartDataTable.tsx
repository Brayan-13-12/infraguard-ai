"use client";

import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

import type { ChartDatum } from "./types";

/**
 * Accessible companion to every chart: a real `<table>` with the category,
 * count and percentage for each slice/bar. Charts are never colour-only - this
 * is the keyboard-navigable, screen-reader-friendly source of truth, and each
 * row with a `href` is a drill-down link into the filtered Assets list.
 *
 * `activeKey` / `onRowHover` wire the row to the chart segment for a
 * cross-highlight on hover.
 */
export function ChartDataTable({
  data,
  caption,
  total,
  activeKey = null,
  onRowHover,
  className,
}: {
  data: ChartDatum[];
  /** Describes the dataset for assistive tech (visually hidden). */
  caption: string;
  /** Denominator for the percentage column. Defaults to the sum of values. */
  total?: number;
  activeKey?: string | null;
  onRowHover?: (key: string | null) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);
  const hasLinks = data.some((d) => d.href);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("dashboard.charts.categoryColumn")}</th>
            <th scope="col">{t("dashboard.charts.countColumn")}</th>
            <th scope="col">{t("dashboard.charts.shareColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => {
            const pct = sum > 0 ? Math.round((d.value / sum) * 100) : 0;
            const dim = activeKey !== null && activeKey !== d.key;
            const label = (
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px] transition-transform"
                  style={{
                    background: d.color,
                    transform: activeKey === d.key ? "scale(1.25)" : undefined,
                  }}
                />
                <span className="truncate">{d.label}</span>
                {d.href ? (
                  <ArrowRightIcon
                    className={cn(
                      "h-3 w-3 shrink-0 text-primary transition-opacity",
                      activeKey === d.key ? "opacity-100" : "opacity-0",
                    )}
                  />
                ) : null}
              </span>
            );
            return (
              <tr
                key={d.key}
                onMouseEnter={() => onRowHover?.(d.key)}
                onMouseLeave={() => onRowHover?.(null)}
                className={cn(
                  "rounded-md transition-colors [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md",
                  activeKey === d.key && "bg-muted/70",
                  dim && "opacity-55",
                )}
              >
                <td className="py-1.5 pl-2 pr-2">
                  {d.href ? (
                    <Link
                      href={d.href}
                      onFocus={() => onRowHover?.(d.key)}
                      onBlur={() => onRowHover?.(null)}
                      className="inline-flex rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{label}</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                  {d.value}
                </td>
                <td className="py-1.5 pl-3 pr-2 text-right tabular-nums text-muted-foreground">
                  {t("dashboard.charts.shareOfTotal", { percent: pct })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasLinks ? (
        <p className="pl-2 text-[11px] text-muted-foreground">
          {t("dashboard.charts.clickToFilter")}
        </p>
      ) : null}
    </div>
  );
}
