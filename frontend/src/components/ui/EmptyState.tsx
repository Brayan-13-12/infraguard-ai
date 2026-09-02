import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {/* Faint infrastructure dot grid - ambient identity, never behind text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_60%_at_50%_35%,black,transparent)] bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] bg-[size:20px_20px]"
      />
      <div className="relative flex flex-col items-center gap-2">
        {icon ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
