"use client";

import { useTranslation, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/cn";
import type { ComponentState } from "@/types/health";

const STYLES: Record<
  ComponentState["kind"],
  { dot: string; labelKey: TranslationKey; text: string }
> = {
  loading: {
    dot: "bg-muted-foreground animate-pulse motion-reduce:animate-none",
    labelKey: "systemHealth.status.checking",
    text: "text-muted-foreground",
  },
  operational: {
    dot: "bg-success",
    labelKey: "systemHealth.status.operational",
    text: "text-success",
  },
  down: {
    dot: "bg-danger",
    labelKey: "systemHealth.status.unavailable",
    text: "text-danger",
  },
  unknown: {
    dot: "bg-warning",
    labelKey: "systemHealth.status.unknown",
    text: "text-warning",
  },
};

export function StatusIndicator({
  name,
  state,
}: {
  name: string;
  state: ComponentState;
}) {
  const { t } = useTranslation();
  const style = STYLES[state.kind];
  const detail = "detail" in state ? state.detail : undefined;

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="text-right">
        <span className={cn("text-sm font-semibold", style.text)}>{t(style.labelKey)}</span>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </li>
  );
}
