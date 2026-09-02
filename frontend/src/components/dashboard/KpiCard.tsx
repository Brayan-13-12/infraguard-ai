import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type KpiTone = "neutral" | "primary" | "danger" | "warning" | "info" | "success";

/** The small indicator dot / hairline is the only semantic colour on the card -
 *  the number stays foreground so a row of six KPIs reads calm, not rainbow. */
const DOT: Record<KpiTone, string> = {
  neutral: "bg-muted-foreground/40",
  primary: "bg-primary",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
};

/**
 * One dashboard KPI - a real link into the filtered Assets list. Restrained at
 * rest (semantic dot, concise label, large tabular number, a quiet drill hint);
 * on hover/focus it lifts, the hint turns primary and its arrow nudges.
 */
export function KpiCard({
  label,
  value,
  href,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
  tone?: KpiTone;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-xs transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-0 motion-reduce:hover:translate-y-0"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[1.7rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/70 transition-colors group-hover:text-primary group-focus-visible:text-primary">
        <span className="truncate">{hint}</span>
        <ArrowRightIcon className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
