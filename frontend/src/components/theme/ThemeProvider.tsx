"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme engine (next-themes).
 *
 * - `attribute="class"` toggles `class="dark"` on <html> so the semantic tokens
 *   in `globals.css` swap. There are no Tailwind `dark:` variants anywhere.
 * - `defaultTheme="dark"` - dark is InfraGuard's primary visual identity, so a
 *   first-time visitor lands in dark. `enableSystem` still lets a stored
 *   `"system"` choice track the OS; an explicit light/dark tap is persisted to
 *   `localStorage` (key: `theme`) and always wins on the next visit.
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
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
    >
      {children}
    </NextThemesProvider>
  );
}
