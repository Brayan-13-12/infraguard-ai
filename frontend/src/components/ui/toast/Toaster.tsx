"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AlertTriangleIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

import { dismissToast, subscribe, type ToastRecord, type ToastTone } from "./store";

const TONE_WRAP: Record<ToastTone, string> = {
  success: "border-success/35 bg-surface-elevated",
  info: "border-primary/35 bg-surface-elevated",
  warning: "border-warning/40 bg-surface-elevated",
  danger: "border-danger/40 bg-surface-elevated",
};

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckIcon className="text-success" />,
  info: <CheckIcon className="text-primary" />,
  warning: <AlertTriangleIcon className="text-warning" />,
  danger: <AlertTriangleIcon className="text-danger" />,
};

function ToastItem({ record }: { record: ToastRecord }) {
  const { t } = useTranslation();
  const timerRef = useRef<number | null>(null);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const arm = () => {
    clear();
    if (record.durationMs > 0) {
      timerRef.current = window.setTimeout(() => dismissToast(record.id), record.durationMs);
    }
  };

  useEffect(() => {
    arm();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  return (
    <div
      role={record.important ? "alert" : "status"}
      aria-live={record.important ? "assertive" : "polite"}
      onMouseEnter={clear}
      onMouseLeave={arm}
      onFocus={clear}
      onBlur={arm}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-sm shadow-lg motion-safe:animate-fade-in-up",
        TONE_WRAP[record.tone],
      )}
    >
      <span className="mt-0.5 shrink-0">{TONE_ICON[record.tone]}</span>
      <div className="min-w-0 flex-1">
        {record.title ? (
          <p className="font-medium text-foreground">{record.title}</p>
        ) : null}
        {record.description ? (
          <p className={cn("text-muted-foreground", record.title && "mt-0.5")}>
            {record.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(record.id)}
        aria-label={t("toast.dismiss")}
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Global toast surface. Mount once (root layout). Desktop: a top-right stack.
 * Mobile: a bottom-centered stack. Auto-dismiss with pause-on-hover / focus,
 * manual dismiss, `role="status"` (or `"alert"` for important errors), and
 * reduced-motion respected via `motion-safe:` entrance only.
 */
export function Toaster() {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => subscribe(setToasts), []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-label={t("toast.regionLabel")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
    >
      <div className="flex w-full max-w-sm flex-col gap-2">
        {toasts.map((record) => (
          <ToastItem key={record.id} record={record} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
