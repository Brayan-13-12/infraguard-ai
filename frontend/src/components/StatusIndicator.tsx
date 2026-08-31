import type { ComponentState } from "@/types/health";

const STYLES: Record<
  ComponentState["kind"],
  { dot: string; label: string; text: string }
> = {
  loading: { dot: "bg-slate-400 animate-pulse", label: "Checking…", text: "text-slate-500" },
  operational: { dot: "bg-emerald-500", label: "Operational", text: "text-emerald-600" },
  down: { dot: "bg-red-500", label: "Unavailable", text: "text-red-600" },
  unknown: { dot: "bg-amber-500", label: "Unknown", text: "text-amber-600" },
};

export function StatusIndicator({
  name,
  state,
}: {
  name: string;
  state: ComponentState;
}) {
  const style = STYLES[state.kind];
  const detail = "detail" in state ? state.detail : undefined;

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
        <span className="font-medium">{name}</span>
      </div>
      <div className="text-right">
        <span className={`text-sm font-semibold ${style.text}`}>{style.label}</span>
        {detail ? (
          <p className="text-xs text-slate-400">{detail}</p>
        ) : null}
      </div>
    </li>
  );
}
