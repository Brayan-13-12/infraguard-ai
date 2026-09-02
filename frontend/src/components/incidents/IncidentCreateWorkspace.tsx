"use client";

import { IncidentForm } from "@/components/incidents/IncidentForm";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { createIncident } from "@/services/incidents";

/**
 * Route-intercepted "Nuevo incidente" - a **centered modal** over the list (the
 * list stays mounted behind it). Same `WorkspaceDialog` chrome as the detail
 * workspace, in its smaller `modal` variant. `IncidentForm` (with the improved
 * asset picker) is used verbatim; the full-page fallback at `/incidents/new`
 * renders the same form.
 */
export function IncidentCreateWorkspace() {
  const { t } = useTranslation();
  const close = useCloseDrawer("/incidents");

  return (
    <WorkspaceDialog
      variant="modal"
      label={t("incidentForm.createTitle")}
      onClose={close}
      initialFocus='input[name="title"]'
      header={
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("incidentForm.createTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("incidentForm.createSubtitle")}
          </p>
        </div>
      }
    >
      <IncidentForm
        mode="create"
        onSubmit={createIncident}
        onSuccess={(incident) => {
          notifyIncidentsChanged({ focusId: incident.id });
          toast({ tone: "success", description: t("incidentForm.createdToast") });
          close();
        }}
        onCancel={close}
      />
    </WorkspaceDialog>
  );
}
