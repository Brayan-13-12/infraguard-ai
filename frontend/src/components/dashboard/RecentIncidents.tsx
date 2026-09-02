"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  IncidentStatusBadge,
  SeverityBadge,
} from "@/components/incidents/IncidentBadges";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon, ChevronRightIcon, ShieldIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { getIncidentSummary, listIncidents } from "@/services/incidents";
import type { Incident, IncidentSummary } from "@/types/incident";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; items: Incident[]; summary: IncidentSummary | null }
  | { kind: "error" };

/**
 * A compact "Incidentes recientes" block for the dashboard: the five most
 * recently updated incidents plus an open/critical count line. Rows use the
 * full detail route (the dashboard is outside `/incidents`, so there is no list
 * to keep behind a drawer). Refetches when `refreshToken` changes.
 */
export function RecentIncidents({ refreshToken = 0 }: { refreshToken?: number }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (refreshToken === 0) setState({ kind: "loading" });
    void Promise.all([
      listIncidents({ page: 1, pageSize: 5, sort: "recent" }),
      getIncidentSummary(),
    ]).then(([list, summary]) => {
      if (cancelled) return;
      if (list.ok) {
        setState({
          kind: "loaded",
          items: list.data.items,
          summary: summary.ok ? summary.data : null,
        });
      } else {
        setState({ kind: "error" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(LANGUAGE_LOCALES[language], {
      day: "2-digit",
      month: "short",
    });

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldIcon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("dashboard.incidents.title")}
          </h3>
          {state.kind === "loaded" && state.summary ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t("dashboard.incidents.summary", {
                open: state.summary.open,
                critical: state.summary.critical_open,
              })}
            </span>
          ) : null}
        </div>
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("dashboard.incidents.viewAll")}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dashboard.incidents.loadError")}
        </p>
      ) : state.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dashboard.incidents.empty")}
        </p>
      ) : (
        <>
          <table className="hidden w-full text-sm sm:table">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:pb-2 [&>th]:font-medium">
                <th>{t("incidents.columns.incident")}</th>
                <th>{t("incidents.columns.severity")}</th>
                <th>{t("incidents.columns.status")}</th>
                <th>{t("incidents.columns.affected")}</th>
                <th className="text-right">{t("incidents.columns.updated")}</th>
                <th aria-hidden="true" className="w-6" />
              </tr>
            </thead>
            <tbody>
              {state.items.map((incident) => (
                <tr
                  key={incident.id}
                  className="group border-t border-border/60 transition-colors hover:bg-muted/40 [&>td]:py-2.5"
                >
                  <td className="pr-3">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="font-medium text-foreground group-hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {incident.title}
                    </Link>
                  </td>
                  <td className="pr-3">
                    <SeverityBadge value={incident.severity} />
                  </td>
                  <td className="pr-3">
                    <IncidentStatusBadge value={incident.status} />
                  </td>
                  <td className="pr-3 tabular-nums text-muted-foreground">
                    {incident.affected_asset_count}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {fmtDate(incident.updated_at)}
                  </td>
                  <td className="pl-2 text-right">
                    <ChevronRightIcon className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="flex flex-col gap-2 sm:hidden">
            {state.items.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/incidents/${incident.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {incident.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtDate(incident.updated_at)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge value={incident.severity} />
                      <IncidentStatusBadge value={incident.status} />
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
