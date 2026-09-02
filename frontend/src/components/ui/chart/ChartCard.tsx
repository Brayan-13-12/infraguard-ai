import type { ComponentType, SVGProps } from "react";

import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/**
 * Titled container for a dashboard insight. `accent` adds a thin left brand rail;
 * `elevated` + `glow` promote it to a level-1 surface with a faint primary
 * halo. The header follows the console pattern: an icon chip + a compact title.
 */
export function ChartCard({
  title,
  icon: Icon,
  action,
  accent = false,
  elevated = false,
  glow = false,
  children,
  className,
}: {
  title: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  action?: React.ReactNode;
  accent?: boolean;
  elevated?: boolean;
  glow?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      elevated={elevated}
      className={cn(
        "relative flex flex-col overflow-hidden p-5 sm:p-6",
        elevated && "shadow-raised",
        accent &&
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:content-['']",
        className,
      )}
    >
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/[0.07] blur-3xl"
        />
      ) : null}
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      <div className="relative flex flex-1 flex-col">{children}</div>
    </Card>
  );
}

/** Loading placeholder used as the `next/dynamic` fallback for a chart. */
export function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Skeleton className="mx-auto h-40 w-40 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </Card>
  );
}
