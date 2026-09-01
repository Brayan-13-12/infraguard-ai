import { cn } from "@/lib/cn";

/** InfraGuard AI identity: a geometric shield mark + wordmark. Original, not a copy. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2.5 4 5.5v6c0 5 3.4 8.4 8 10.5 4.6-2.1 8-5.5 8-10.5v-6L12 2.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 12.2 11 14.7l4.5-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          InfraGuard AI
        </span>
        {subtitle ? (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
