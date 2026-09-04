"use client";

import {
  IncidentDetailBadges,
  IncidentDetailContent,
  IncidentLifecycleActions,
  MoveIncidentToTrashButton,
} from "@/components/incidents/IncidentDetail";
import { AskAiButton } from "@/components/ai/AskAiButton";
import { IncidentDetailLoader } from "@/components/incidents/IncidentDetailLoader";
import { InTrashNotice } from "@/components/trash/InTrashNotice";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-9 w-64" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Route-aware Incident detail workspace: a large centered dialog opened by an
 * intercepting route over the still-mounted list. The same
 * {@link IncidentDetailContent} powers the full-page fallback at
 * `/incidents/[id]`.
 */
export function IncidentDetailWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/incidents");

  return (
    <IncidentDetailLoader
      id={id}
      render={({ state, reload, setIncident }) => {
        const incident = state.kind === "ready" ? state.incident : null;

        const header = (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {incident ? incident.title : t("incidentDetail.overview")}
            </h2>
            {incident ? <IncidentDetailBadges incident={incident} /> : null}
          </div>
        );

        const footer = incident ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AskAiButton entity={{ type: "incident", id: incident.id }} />
            <div className="flex items-center gap-3">
              <MoveIncidentToTrashButton incident={incident} onDeleted={close} />
              <IncidentLifecycleActions incident={incident} onChanged={setIncident} />
            </div>
          </div>
        ) : undefined;

        return (
          <WorkspaceDialog
            label={incident ? incident.title : t("incidentDetail.overview")}
            header={header}
            footer={footer}
            onClose={close}
          >
            {state.kind === "loading" ? (
              <WorkspaceSkeleton />
            ) : state.kind === "gone" ? (
              <InTrashNotice kind="incidents" compact />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm font-medium text-foreground">
                  {state.kind === "notfound"
                    ? t("incidentDetail.notFoundTitle")
                    : t("incidentDetail.loadError")}
                </p>
                {state.kind === "notfound" ? (
                  <p className="max-w-xs text-sm text-muted-foreground">
                    {t("incidentDetail.notFoundBody")}
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
              <IncidentDetailContent incident={state.incident} onChanged={setIncident} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}
