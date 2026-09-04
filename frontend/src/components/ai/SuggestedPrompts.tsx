"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  HistoryIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

const GLOBAL_PROMPTS = [
  { key: "ai.suggestions.criticalAssets", icon: ActivityIcon },
  { key: "ai.suggestions.openIncidents", icon: ShieldIcon },
  { key: "ai.suggestions.recentChanges", icon: HistoryIcon },
  { key: "ai.suggestions.riskOverview", icon: AlertTriangleIcon },
] as const;

export function SuggestedPrompts({
  onPick,
  prompts,
}: {
  onPick: (text: string) => void;
  /** Explicit prompt strings (e.g. context-specific). Defaults to the global set. */
  prompts?: string[];
}) {
  const { t } = useTranslation();

  if (prompts && prompts.length > 0) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {p}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
      {GLOBAL_PROMPTS.map(({ key, icon: Icon }) => {
        const label = t(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(label)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
