import { cn } from "@/lib/cn";
import { AlertTriangleIcon, CheckIcon } from "./icons";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { wrap: string; icon: React.ReactNode }> = {
  info: { wrap: "border-primary/30 bg-primary/10 text-foreground", icon: null },
  success: {
    wrap: "border-success/30 bg-success/10 text-foreground",
    icon: <CheckIcon className="text-success" />,
  },
  warning: {
    wrap: "border-warning/35 bg-warning/12 text-foreground",
    icon: <AlertTriangleIcon className="text-warning" />,
  },
  danger: {
    wrap: "border-danger/35 bg-danger/10 text-foreground",
    icon: <AlertTriangleIcon className="text-danger" />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-3.5 py-3 text-sm",
        t.wrap,
        className,
      )}
    >
      {t.icon ? <span className="mt-0.5 shrink-0">{t.icon}</span> : null}
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
