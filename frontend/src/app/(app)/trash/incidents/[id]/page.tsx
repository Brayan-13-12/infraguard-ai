"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { RestoreAction } from "@/components/trash/RestoreAction";
import { TrashIncidentLoader } from "@/components/trash/TrashDetailLoader";
import { TrashIncidentDetailPage } from "@/components/trash/TrashIncidentDetail";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/** Full-page trashed-incident detail - deep-link / refresh fallback. */
export default function TrashIncidentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <TrashIncidentLoader
      id={id}
      render={({ state, reload }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind === "notfound" || state.kind === "error") {
          return (
            <EmptyState
              icon={<TrashIcon />}
              title={
                state.kind === "notfound"
                  ? t("trashDetail.notFoundTitle")
                  : t("trashDetail.loadError")
              }
              description={
                state.kind === "notfound" ? t("trashDetail.notFoundBody") : undefined
              }
              action={
                <div className="flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Link
                    href="/trash?type=incidents"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("trashDetail.backToList")}
                  </Link>
                </div>
              }
            />
          );
        }
        return (
          <Reveal>
            <TrashIncidentDetailPage
              incident={state.item}
              actions={
                <RestoreAction
                  kind="incidents"
                  id={state.item.id}
                  label={state.item.title}
                  onRestored={() => router.push("/trash?type=incidents")}
                />
              }
            />
          </Reveal>
        );
      }}
    />
  );
}
