"use client";

import { CloseIcon } from "@/components/ui/icons";
import { Drawer } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Consistent chrome for every Incident drawer: a right-side {@link Drawer} (full
 * width on mobile, ~600px on desktop) with a `shrink-0` header carrying the
 * close control, a scrollable body, and an optional `shrink-0` action footer.
 * Mirrors `AssetDrawerShell` so Incidents feel like the same product surface.
 */
export function IncidentDrawerShell({
  label,
  header,
  footer,
  children,
  onClose,
  initialFocus,
  contentClassName,
}: {
  label: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  initialFocus?: string;
  contentClassName?: string;
}) {
  const { t } = useTranslation();

  return (
    <Drawer
      open
      onClose={onClose}
      side="right"
      label={label}
      showClose={false}
      initialFocus={initialFocus}
      className="flex w-full flex-col sm:max-w-[38rem]"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("overlay.close")}
          className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <CloseIcon />
        </button>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5", contentClassName)}>
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5 [padding-bottom:max(0.875rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      ) : null}
    </Drawer>
  );
}
