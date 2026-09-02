"use client";

import { BrandMark } from "@/components/Brand";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ActivityIcon, BoxIcon, SparklesIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/**
 * Enterprise split authentication layout.
 *
 * Desktop (`lg+`), ~55/45: a deep, branded slate panel on the left (brand,
 * product statement, three restrained capability highlights, a faint
 * node-topology backdrop with one or two softly pulsing nodes) and a focused
 * auth card on the right. The contextual theme toggle lives **inside** the card
 * header. The left panel is a deliberately theme-independent canvas
 * (`--auth-panel*` tokens - dark in both light and dark mode).
 *
 * Mobile: the marketing panel collapses away entirely - brand + short tagline +
 * card, single column, no horizontal overflow. The authentication flow itself
 * is unchanged.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  const capabilities = [
    {
      icon: BoxIcon,
      title: t("auth.split.inventoryTitle"),
      body: t("auth.split.inventoryBody"),
    },
    {
      icon: ActivityIcon,
      title: t("auth.split.operationsTitle"),
      body: t("auth.split.operationsBody"),
    },
    {
      icon: SparklesIcon,
      title: t("auth.split.aiTitle"),
      body: t("auth.split.aiBody"),
    },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-background lg:grid lg:grid-cols-[1.2fr_1fr]">
      {/* LEFT - branded marketing panel, desktop only */}
      <aside className="relative hidden overflow-hidden bg-auth-panel px-12 py-14 text-auth-panel-foreground lg:flex lg:flex-col xl:px-20">
        <TopologyBackdrop />

        <div className="relative z-10 flex flex-1 flex-col">
          <span className="inline-flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <span className="text-base font-semibold tracking-tight">InfraGuard AI</span>
          </span>

          <div className="my-auto max-w-md">
            <div className="relative motion-safe:animate-fade-in-up">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-primary/[0.12] blur-3xl"
              />
              <h1 className="relative text-balance text-[2rem] font-semibold leading-[1.18] tracking-tight xl:text-[2.6rem]">
                {t("auth.split.statement")}
              </h1>
            </div>

            <ul className="mt-12 flex flex-col gap-7">
              {capabilities.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-auth-panel-border bg-white/[0.04] text-info">
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-auth-panel-foreground">
                      {title}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-auth-panel-muted">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <span className="text-xs tracking-wide text-auth-panel-muted">
            InfraGuard AI · Infrastructure operations console
          </span>
        </div>
      </aside>

      {/* RIGHT - authentication */}
      <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 sm:px-8">
        {/* Mobile-only brand + tagline (the left panel is hidden here). */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
          <span className="inline-flex items-center gap-2.5">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              InfraGuard AI
            </span>
          </span>
          <p className="max-w-xs text-pretty text-sm text-muted-foreground">
            {t("auth.split.statement")}
          </p>
        </div>

        <div className="w-full max-w-sm motion-safe:animate-fade-in-up">
          <div className="relative rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="absolute right-4 top-4">
              <ThemeToggle />
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Faint infrastructure node-topology - restrained, no gradients, no imagery.
 * One or two nodes carry a very slow expanding halo (`motion-safe` only).
 */
function TopologyBackdrop() {
  const nodes: Array<[number, number]> = [
    [70, 84],
    [196, 58],
    [318, 128],
    [176, 202],
    [300, 262],
    [96, 286],
    [232, 342],
  ];
  const pulsing = new Set([1, 4]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(90%_70%_at_18%_8%,black,transparent_78%)] bg-[linear-gradient(hsl(var(--auth-panel-border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--auth-panel-border))_1px,transparent_1px)] bg-[size:56px_56px]" />
      <svg
        className="absolute -right-12 top-1/2 h-[44rem] w-[44rem] -translate-y-1/2 opacity-60"
        viewBox="0 0 400 400"
        fill="none"
      >
        <g stroke="hsl(var(--info))" strokeOpacity="0.26" strokeWidth="1">
          <path d="M70 84 L196 58 L318 128 M196 58 L176 202 M318 128 L300 262 M176 202 L300 262 M176 202 L96 286 M300 262 L232 342 M96 286 L232 342" />
        </g>
        {nodes.map(([cx, cy], i) => (
          <g key={`${cx}-${cy}`}>
            {pulsing.has(i) ? (
              <circle
                cx={cx}
                cy={cy}
                r="6"
                fill="hsl(var(--primary))"
                className="origin-center motion-safe:animate-node-ping"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ) : null}
            <circle cx={cx} cy={cy} r="3.5" fill="hsl(var(--primary))" fillOpacity="0.6" />
          </g>
        ))}
      </svg>
    </div>
  );
}
