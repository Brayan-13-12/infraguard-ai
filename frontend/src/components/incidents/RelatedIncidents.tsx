"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { listIncidents } from "@/services/incidents";
import type { Incident } from "@/types/incident";

import { IncidentStatusBadge, SeverityBadge } from "./IncidentBadges";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; items: Incident[]; total: number }
  | { kind: "error" };

/**
 * "Incidentes relacionados" - the incidents that affect a given asset. Rendered
 * inside the Asset detail experience. Rows link into the Incidents experience.
 * Dependencies / topology remain a future milestone and are not implied here.
 */
export function RelatedIncidents({ assetId }: { assetId: string }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void listIncidents({ assetId, page: 1, pageSize: 5, sort: "recent" }).then((res) => {
      if (cancelled) return;
      setState(
        res.ok
          ? { kind: "loaded", items: res.data.items, total: res.data.total }
          : { kind: "error" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(LANGUAGE_LOCALES[language], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("assetDetail.relatedIncidentsTitle")}
        </h3>
        {state.kind === "loaded" && state.total > state.items.length ? (
          <Link
            href={`/incidents?asset_id=${encodeURIComponent(assetId)}`}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("assetDetail.relatedIncidentsViewAll")}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <p className="text-sm text-muted-foreground">
          {t("assetDetail.relatedIncidentsError")}
        </p>
      ) : state.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("assetDetail.relatedIncidentsEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {state.items.map((incident) => (
            <li key={incident.id} className="py-2 first:pt-0 last:pb-0">
              <Link
                href={`/incidents/${incident.id}`}
                className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {incident.title}
                </span>
                <SeverityBadge value={incident.severity} />
                <IncidentStatusBadge value={incident.status} />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {fmt(incident.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
