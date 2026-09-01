"use client";

import { LANGUAGE_LABELS, LANGUAGE_NAMES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Compact ES | EN switcher. A labelled group of toggle buttons - Tab to reach,
 * Space/Enter to activate, `aria-pressed` marks the active language. The choice
 * persists to `localStorage` (a non-sensitive preference).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, languages, setLanguage, t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("a11y.changeLanguage")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5",
        className,
      )}
    >
      {languages.map((code) => {
        const active = code === language;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            aria-label={LANGUAGE_NAMES[code]}
            title={LANGUAGE_NAMES[code]}
            className={cn(
              "h-7 min-w-[2rem] rounded-md px-2 text-xs font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LANGUAGE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
