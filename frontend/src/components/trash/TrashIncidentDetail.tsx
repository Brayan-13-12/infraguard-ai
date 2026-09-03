"use client";

import Link from "next/link";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import {
  IncidentStatusBadge,
  PriorityBadge,
  SeverityBadge,
} from "@/components/incidents/IncidentBadges";
import { IncidentTimeline } from "@/components/incidents/IncidentTimeline";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { DetailRow, NotSet } from "@/components/ui/DetailRow";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type {
  AssetStatus,
  Criticality,
} from "@/types/asset";
import type { TrashIncidentDetail as TrashIncident } from "@/types/trash";

import { formatDateTime } from "./catalog";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </code>
  );
}

function AffectedAssets({ incident }: { incident: TrashIncident }) {
  const { t } = useTranslation();
  if (incident.affected_assets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("incidentDetail.affectedEmpty")}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {incident.affected_assets.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <span className="font-mono text-[13px] font-medium text-foreground">{a.name}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {a.deleted_at ? (
              <Badge tone="neutral" className="text-[10px]">
                {t("incidentDetail.assetInTrash")}
              </Badge>
            ) : null}
            <CriticalityBadge value={a.criticality as Criticality} />
            <AssetStatusBadge value={a.status as AssetStatus} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Read-only body for a trashed incident, with the preserved timeline. */
export function TrashIncidentDetailContent({ incident }: { incident: TrashIncident }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="warning">{t("trashDetail.readOnlyNotice")}</Alert>

      <section>
        <dl className="-mt-1">
          <DetailRow label={t("incidentFields.title")}>{incident.title}</DetailRow>
          <DetailRow label={t("incidentFields.severity")}>
            <SeverityBadge value={incident.severity} />
          </DetailRow>
          <DetailRow label={t("incidentFields.status")}>
            <IncidentStatusBadge value={incident.status} />
          </DetailRow>
          <DetailRow label={t("incidentFields.priority")}>
            <PriorityBadge value={incident.priority} />
          </DetailRow>
          <DetailRow label={t("incidentFields.owner")}>
            {incident.owner ?? <NotSet label={t("incidentDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("incidentFields.started")}>
            {formatDateTime(incident.started_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.detected")}>
            {incident.detected_at ? (
              formatDateTime(incident.detected_at, locale)
            ) : (
              <NotSet label={t("incidentDetail.notSet")} />
            )}
          </DetailRow>
          <DetailRow label={t("incidentFields.resolved")}>
            {incident.resolved_at ? (
              formatDateTime(incident.resolved_at, locale)
            ) : (
              <NotSet label={t("incidentDetail.notSet")} />
            )}
          </DetailRow>
          <DetailRow label={t("incidentFields.description")}>
            {incident.description ? (
              <span className="whitespace-pre-wrap">{incident.description}</span>
            ) : (
              <NotSet label={t("incidentDetail.noDescription")} />
            )}
          </DetailRow>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          {t("incidentFields.affectedAssets")}
        </h3>
        <AffectedAssets incident={incident} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          {t("incidentDetail.timeline")}
        </h3>
        <IncidentTimeline events={incident.timeline} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("trashDetail.deletedSection")}
        </h3>
        <dl className="-mt-1">
          <DetailRow label={t("trashDetail.deletedBy")}>
            {incident.deleted_by_email ?? <NotSet label={t("trash.deletedBySystem")} />}
          </DetailRow>
          <DetailRow label={t("trashDetail.deletedAt")}>
            {formatDateTime(incident.deleted_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.created")}>
            {formatDateTime(incident.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.updated")}>
            {formatDateTime(incident.updated_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.id")}>
            <Code>{incident.id}</Code>
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}

export function TrashIncidentDetailPage({
  incident,
  actions,
}: {
  incident: TrashIncident;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/trash?type=incidents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("trashDetail.backToList")}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {incident.title}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("trashDetail.incidentTitle")}</p>
        </div>
        {actions}
      </header>
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <TrashIncidentDetailContent incident={incident} />
      </div>
    </div>
  );
}
