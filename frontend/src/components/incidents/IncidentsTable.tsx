"use client";

import Link from "next/link";

import { ChevronRightIcon, PencilIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Incident } from "@/types/incident";

import { IncidentStatusBadge, PriorityBadge, SeverityBadge } from "./IncidentBadges";

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TitleLink({ incident }: { incident: Incident }) {
  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 group-hover/row:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {incident.title}
    </Link>
  );
}

function EditAction({ incident, className }: { incident: Incident; className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/incidents/${incident.id}/edit`}
      aria-label={`${t("incidentDetail.edit")}: ${incident.title}`}
      className={cn(
        "relative z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <PencilIcon className="h-3.5 w-3.5" />
    </Link>
  );
}

function affectedLabel(t: ReturnType<typeof useTranslation>["t"], count: number): string {
  if (count === 0) return t("incidents.affectedNone");
  if (count === 1) return t("incidents.affectedCountOne");
  return t("incidents.affectedCount", { count });
}

export function IncidentsTable({
  incidents,
  highlightId,
}: {
  incidents: Incident[];
  highlightId?: string;
}) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <>
      {/* Desktop / wide: a real table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&>th]:px-4 [&>th]:py-2.5 xl:[&>th]:px-5">
              <th>{t("incidents.columns.incident")}</th>
              <th>{t("incidents.columns.severity")}</th>
              <th>{t("incidents.columns.status")}</th>
              <th>{t("incidents.columns.priority")}</th>
              <th>{t("incidents.columns.affected")}</th>
              <th>{t("incidents.columns.owner")}</th>
              <th className="whitespace-nowrap">{t("incidents.columns.started")}</th>
              <th className="whitespace-nowrap">{t("incidents.columns.updated")}</th>
              <th aria-hidden="true" className="w-16" />
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                className={cn(
                  "group/row relative cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40",
                  "[&>td]:px-4 [&>td]:py-3.5 xl:[&>td]:px-5",
                  highlightId === incident.id && "bg-primary/[0.06]",
                )}
              >
                <td className="max-w-[24rem]">
                  <TitleLink incident={incident} />
                </td>
                <td>
                  <SeverityBadge value={incident.severity} />
                </td>
                <td>
                  <IncidentStatusBadge value={incident.status} />
                </td>
                <td>
                  <PriorityBadge value={incident.priority} />
                </td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {affectedLabel(t, incident.affected_asset_count)}
                </td>
                <td className="text-muted-foreground">{incident.owner ?? "—"}</td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(incident.started_at, locale)}
                </td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(incident.updated_at, locale)}
                </td>
                <td className="text-right">
                  <span className="flex items-center justify-end gap-0.5">
                    <EditAction
                      incident={incident}
                      className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                    />
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / narrow: cards */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {incidents.map((incident) => (
          <li
            key={incident.id}
            className={cn(
              "group/row relative rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-primary/30 active:bg-muted/30",
              highlightId === incident.id && "border-primary/40 bg-primary/[0.06]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <TitleLink incident={incident} />
              <span className="relative z-[1] flex shrink-0 items-center gap-1">
                <SeverityBadge value={incident.severity} />
                <EditAction incident={incident} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.status")}</dt>
                <dd className="mt-0.5">
                  <IncidentStatusBadge value={incident.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.priority")}</dt>
                <dd className="mt-0.5">
                  <PriorityBadge value={incident.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.affected")}</dt>
                <dd className="text-foreground">
                  {affectedLabel(t, incident.affected_asset_count)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.owner")}</dt>
                <dd className="text-foreground">{incident.owner ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.started")}</dt>
                <dd className="text-foreground tabular-nums">
                  {formatDate(incident.started_at, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("incidents.columns.updated")}</dt>
                <dd className="text-foreground tabular-nums">
                  {formatDate(incident.updated_at, locale)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
