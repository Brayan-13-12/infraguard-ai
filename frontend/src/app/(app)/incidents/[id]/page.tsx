"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { IncidentDetail } from "@/components/incidents/IncidentDetail";
import { IncidentDetailLoader } from "@/components/incidents/IncidentDetailLoader";
import { InTrashNotice } from "@/components/trash/InTrashNotice";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { ShieldIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/** Full-page incident detail - the deep-link / refresh fallback for the drawer. */
export default function IncidentDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <IncidentDetailLoader
      id={id}
      render={({ state, reload, setIncident }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind === "gone") {
          return (
            <Reveal>
              <InTrashNotice kind="incidents" />
            </Reveal>
          );
        }
        if (state.kind === "notfound" || state.kind === "error") {
          return (
            <EmptyState
              icon={<ShieldIcon />}
              title={
                state.kind === "notfound"
                  ? t("incidentDetail.notFoundTitle")
                  : t("incidentDetail.loadError")
              }
              description={
                state.kind === "notfound" ? t("incidentDetail.notFoundBody") : undefined
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
          <Reveal>
            <IncidentDetail
              incident={state.incident}
              onChanged={setIncident}
              onDeleted={() => router.push("/incidents")}
            />
          </Reveal>
        );
      }}
    />
  );
}
