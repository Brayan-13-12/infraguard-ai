import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
  /** Accessible label; omit and set `decorative` when inside a labelled control. */
  label?: string;
  decorative?: boolean;
}

/** Motion is disabled automatically under `prefers-reduced-motion`. */
export function Spinner({ className, label = "Loading", decorative = false }: SpinnerProps) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-hidden={decorative || undefined}
      aria-live={decorative ? undefined : "polite"}
      className={cn("inline-flex items-center", className)}
    >
      <svg
        className="h-4 w-4 animate-spin motion-reduce:animate-none"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
