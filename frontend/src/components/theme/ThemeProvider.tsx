"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme engine (next-themes).
 *
 * - `attribute="class"` toggles `class="dark"` on <html> so Tailwind's `dark:`
 *   variant works.
 * - `defaultTheme="system"` + `enableSystem` respect the OS preference on first
 *   visit; an explicit choice is persisted to `localStorage` (key: `theme`).
 * - next-themes injects a tiny blocking script before hydration, so there is no
 *   theme flash and no hydration mismatch. `<html suppressHydrationWarning>` in
 *   the root layout is required for this.
 * - `disableTransitionOnChange` suppresses color transitions during the switch.
 *
 * The stored value is a non-sensitive UI preference - never auth data.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
    >
      {children}
    </NextThemesProvider>
  );
}
