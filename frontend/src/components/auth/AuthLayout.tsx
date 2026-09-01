"use client";

import { BrandMark } from "@/components/Brand";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Single centered authentication card - fully self-contained.
 *
 * There is no page-level header: the brand, language switcher and theme toggle
 * live in a compact row inside the card itself, so nothing floats in the
 * corners. The card sits centered on a restrained, premium backdrop (a faint
 * primary glow plus a masked infrastructure-grid texture) and rises in with a
 * short fade (disabled under reduced motion). `login` and `register` share it.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-8%,hsl(var(--primary)/0.16),transparent_70%)]" />
        <div className="absolute inset-0 opacity-40 [mask-image:radial-gradient(72%_60%_at_50%_0%,black,transparent)] bg-[linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.55)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="w-full max-w-[24rem] motion-safe:animate-fade-in-up">
        <div className="rounded-2xl border border-border bg-surface/95 p-6 shadow-lg backdrop-blur-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2">
              <BrandMark />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                InfraGuard AI
              </span>
            </span>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
