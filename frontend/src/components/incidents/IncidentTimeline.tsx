"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  BoxIcon,
  CheckIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type { IncidentEvent } from "@/types/incident";

import { EVENT_ICON } from "./catalog";

const ICONS = {
  created: PlusIcon,
  status: ActivityIcon,
  severity: AlertTriangleIcon,
  priority: ActivityIcon,
  owner: ActivityIcon,
  asset: BoxIcon,
  comment: PencilIcon,
  resolved: CheckIcon,
  reopened: RefreshIcon,
} as const;

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A restrained vertical timeline. Events are shown oldest-first (the order the
 * backend returns them). Icons are muted - never a bright colour per type -
 * and each row shows the message, the actor and the timestamp.
 */
export function IncidentTimeline({ events }: { events: IncidentEvent[] }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClockIcon className="h-4 w-4" />
        {t("incidentTimeline.empty")}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, i) => {
        const Icon = ICONS[EVENT_ICON[event.type]] ?? ActivityIcon;
        const actor = event.actor_email ?? t("incidentTimeline.system");
        const last = i === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
              />
            ) : null}
            <span className="relative z-[1] mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{event.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatDateTime(event.created_at, locale)}</span>
                <span aria-hidden="true"> · </span>
                {t("incidentTimeline.by", { actor })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
