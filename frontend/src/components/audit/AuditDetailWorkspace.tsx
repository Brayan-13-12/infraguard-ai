"use client";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { useTranslation } from "@/i18n";

import { AuditEventHeader, AuditDetailContent, auditEventLabel } from "./AuditDetail";
import { AuditDetailLoader } from "./AuditDetailLoader";

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,160px)_1fr]">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Route-aware audit event workspace: a large centered dialog opened by an
 * intercepting route over the still-mounted timeline. The same
 * {@link AuditDetailContent} powers the full-page fallback at `/audit/[id]`.
 */
export function AuditDetailWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/audit");

  return (
    <AuditDetailLoader
      id={id}
      render={({ state, reload }) => {
        const event = state.kind === "ready" ? state.event : null;
        const label = event ? auditEventLabel(t, event) : t("auditDetail.overview");

        const header = event ? (
          <AuditEventHeader event={event} />
        ) : (
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t("auditDetail.overview")}
          </h2>
        );

        return (
          <WorkspaceDialog label={label} header={header} onClose={close}>
            {state.kind === "loading" ? (
              <WorkspaceSkeleton />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm font-medium text-foreground">
                  {state.kind === "notfound"
                    ? t("auditDetail.notFoundTitle")
                    : t("auditDetail.loadError")}
                </p>
                {state.kind === "notfound" ? (
                  <p className="max-w-xs text-sm text-muted-foreground">
                    {t("auditDetail.notFoundBody")}
                  </p>
                ) : null}
                <div className="mt-1 flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={close}>
                    {t("overlay.close")}
                  </Button>
                </div>
              </div>
            ) : (
              <AuditDetailContent event={state.event} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}
