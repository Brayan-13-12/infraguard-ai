"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { IncidentDetailLoader } from "@/components/incidents/IncidentDetailLoader";
import { IncidentForm } from "@/components/incidents/IncidentForm";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { ShieldIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { updateIncident } from "@/services/incidents";

/** Full-page "Editar incidente" - the deep-link / refresh fallback for the drawer. */
export default function EditIncidentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <IncidentDetailLoader
      id={id}
      render={({ state, reload }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind !== "ready") {
          return (
            <EmptyState
              icon={<ShieldIcon />}
              title={
                state.kind === "error"
                  ? t("incidentDetail.loadError")
                  : state.kind === "gone"
                    ? t("incidentDetail.inTrashTitle")
                    : t("incidentDetail.notFoundTitle")
              }
              description={
                state.kind === "gone"
                  ? t("incidentDetail.inTrashBody")
                  : state.kind === "notfound"
                    ? t("incidentDetail.notFoundBody")
                    : undefined
              }
              action={
                <div className="flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Link
                    href="/incidents"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("incidentDetail.backToList")}
                  </Link>
                </div>
              }
            />
          );
        }
        return (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <Reveal>
              <PageHeader
                title={t("incidentForm.editTitle")}
                description={t("incidentForm.editSubtitle")}
              />
            </Reveal>
            <Reveal delayMs={60}>
              <IncidentForm
                mode="edit"
                initial={state.incident}
                onSubmit={(input) => updateIncident(id, input)}
                onSuccess={(incident) => {
                  notifyIncidentsChanged();
                  toast({ tone: "success", description: t("incidentForm.updatedToast") });
                  router.push(`/incidents/${incident.id}`);
                }}
                onCancel={() => router.push(`/incidents/${id}`)}
              />
            </Reveal>
          </div>
        );
      }}
    />
  );
}
