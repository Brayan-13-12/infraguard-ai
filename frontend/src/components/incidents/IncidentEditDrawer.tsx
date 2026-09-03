"use client";

import { IncidentDetailLoader } from "@/components/incidents/IncidentDetailLoader";
import { IncidentForm } from "@/components/incidents/IncidentForm";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { updateIncident } from "@/services/incidents";

import { IncidentDrawerShell } from "./IncidentDrawerShell";

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Route-intercepted "Editar incidente". Replaces the detail drawer in the same
 * modal slot (no modal-on-modal); `close` uses `router.back()` so the browser
 * naturally returns to the detail drawer, then the list.
 */
export function IncidentEditDrawer({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/incidents");

  return (
    <IncidentDetailLoader
      id={id}
      render={({ state, reload }) => (
        <IncidentDrawerShell
          label={t("incidentForm.editTitle")}
          onClose={close}
          initialFocus='input[name="title"]'
          header={
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {t("incidentForm.editTitle")}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {state.kind === "ready" ? state.incident.title : t("incidentForm.editSubtitle")}
              </p>
            </div>
          }
        >
          {state.kind === "loading" ? (
            <FormSkeleton />
          ) : state.kind !== "ready" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {state.kind === "error"
                  ? t("incidentDetail.loadError")
                  : state.kind === "gone"
                    ? t("incidentDetail.inTrashTitle")
                    : t("incidentDetail.notFoundTitle")}
              </p>
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
            <IncidentForm
              mode="edit"
              initial={state.incident}
              onSubmit={(input) => updateIncident(id, input)}
              onSuccess={() => {
                notifyIncidentsChanged();
                toast({ tone: "success", description: t("incidentForm.updatedToast") });
                close();
              }}
              onCancel={close}
            />
          )}
        </IncidentDrawerShell>
      )}
    />
  );
}
