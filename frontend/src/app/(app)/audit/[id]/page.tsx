"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AuditDetail } from "@/components/audit/AuditDetail";
import { AuditDetailLoader } from "@/components/audit/AuditDetailLoader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { HistoryIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/** Full-page audit event detail - the deep-link / refresh fallback for the workspace. */
export default function AuditDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  return (
    <AuditDetailLoader
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
              icon={<HistoryIcon />}
              title={
                state.kind === "notfound"
                  ? t("auditDetail.notFoundTitle")
                  : t("auditDetail.loadError")
              }
              description={
                state.kind === "notfound" ? t("auditDetail.notFoundBody") : undefined
              }
              action={
                <div className="flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Link
                    href="/audit"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("auditDetail.backToList")}
                  </Link>
                </div>
              }
            />
          );
        }
        return (
          <Reveal>
            <AuditDetail event={state.event} />
          </Reveal>
        );
      }}
    />
  );
}
