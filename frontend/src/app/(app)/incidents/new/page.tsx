"use client";

import { useRouter } from "next/navigation";

import { IncidentForm } from "@/components/incidents/IncidentForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { createIncident } from "@/services/incidents";

/** Full-page "Nuevo incidente" - the deep-link / refresh fallback for the drawer. */
export default function NewIncidentPage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Reveal>
        <PageHeader
          title={t("incidentForm.createTitle")}
          description={t("incidentForm.createSubtitle")}
        />
      </Reveal>
      <Reveal delayMs={60}>
        <IncidentForm
          mode="create"
          onSubmit={createIncident}
          onSuccess={(incident) => {
            notifyIncidentsChanged({ focusId: incident.id });
            toast({ tone: "success", description: t("incidentForm.createdToast") });
            router.push("/incidents");
          }}
          onCancel={() => router.push("/incidents")}
        />
      </Reveal>
    </div>
  );
}
