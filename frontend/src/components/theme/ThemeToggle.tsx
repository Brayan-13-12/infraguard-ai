"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Single contextual light/dark toggle.
 *
 * The icon shows the mode you switch *to*: a sun while dark is active, a moon
 * while light is active. "System" is never shown - a first-time visitor starts
 * in dark (next-themes `defaultTheme="dark"`), and the first explicit tap
 * persists a concrete `light` / `dark` choice that wins on the next visit.
 *
 * Accessibility: a real `<button>` (Space/Enter, visible focus ring) whose
 * `aria-label` and `title` track the action. A stable, inert placeholder renders
 * until mount so server and client markup match.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const base = cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors",
    "hover:bg-muted hover:text-foreground",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    className,
  );

  if (!mounted) {
    return <span className={base} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";
  const label = isDark ? t("a11y.switchToLight") : t("a11y.switchToDark");

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={base}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
