"use client";

import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { AuditEventListItem } from "@/types/audit";

import { AuditActionIcon } from "./AuditActionIcon";
import { AuditChangePreview } from "./AuditChangePreview";
import {
  auditActionVisual,
  auditEntityLabel,
  auditEventTitle,
  relationDelta,
} from "./catalog";

type T = ReturnType<typeof useTranslation>["t"];

function timeOfDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Local calendar-day key (`YYYY-MM-DD`), used to group the feed. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(iso: string, locale: string, t: T): string {
  const d = new Date(iso);
  const now = new Date();
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return t("audit.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return t("audit.yesterday");
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function groupByDay(
  events: AuditEventListItem[],
): { key: string; label: (locale: string, t: T) => string; events: AuditEventListItem[] }[] {
  const groups: {
    key: string;
    label: (locale: string, t: T) => string;
    events: AuditEventListItem[];
  }[] = [];
  for (const ev of events) {
    const key = dayKey(ev.occurred_at);
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.events.push(ev);
    } else {
      groups.push({
        key,
        label: (locale, t) => dayLabel(ev.occurred_at, locale, t),
        events: [ev],
      });
    }
  }
  return groups;
}

/** The one-line summary shown under an event's title, from list-level data only. */
function EventSummary({ event }: { event: AuditEventListItem }) {
  const { t } = useTranslation();
  const { action, change_preview: preview, change_count: count } = event;

  if (action === "LOGIN" || action === "LOGOUT") return null;

  if (action === "CREATE") {
    return (
      <p className="text-xs text-muted-foreground">
        {t("audit.createdSummary", {
          entity: auditEntityLabel(t, event.entity_type).toLowerCase(),
        })}
      </p>
    );
  }

  if (action === "RELATION_CHANGED") {
    const rel = relationDelta(preview.find((c) => c.field_name === "affected_assets"));
    const parts: string[] = [];
    if (rel.added.length) parts.push(t("audit.relationAdded", { items: rel.added.join(", ") }));
    if (rel.removed.length)
      parts.push(t("audit.relationRemoved", { items: rel.removed.join(", ") }));
    return (
      <p className="text-xs text-muted-foreground">
        {parts.length ? parts.join(" · ") : t("auditActions.RELATION_CHANGED")}
      </p>
    );
  }

  if (preview.length > 0) {
    return <AuditChangePreview changes={preview} changeCount={count} className="mt-0.5" />;
  }

  if (count > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {count === 1 ? t("audit.changeCountOne") : t("audit.changeCount", { count })}
      </p>
    );
  }
  return null;
}

function EventCard({ event }: { event: AuditEventListItem }) {
  const { t } = useTranslation();
  const { accent } = auditActionVisual(event.action);
  const title = auditEventTitle(t, event.action, event.entity_type);
  const isAuth = event.action === "LOGIN" || event.action === "LOGOUT";
  const actor = event.actor_email ?? t("audit.system");

  return (
    <Link
      href={`/audit/${event.id}`}
      className={cn(
        "group/ev relative block rounded-lg border border-border bg-surface py-3 pl-4 pr-3.5",
        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:content-[''] before:transition-colors",
        accent,
        "transition-[transform,border-color,background-color] duration-150 motion-safe:hover:-translate-y-px",
        "hover:border-border/80 hover:bg-muted/40",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">{title}</p>
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover/ev:opacity-100 group-focus-visible/ev:opacity-100">
          {t("audit.viewDetail")}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </div>

      {!isAuth && (event.entity_label || event.entity_id) ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <span className="text-foreground/70">{auditEntityLabel(t, event.entity_type)}</span>
          {" · "}
          <span className="font-mono">{event.entity_label ?? event.entity_id}</span>
        </p>
      ) : null}

      <p className="mt-1 text-xs text-muted-foreground">{actor}</p>

      <div className="mt-1.5">
        <EventSummary event={event} />
      </div>
    </Link>
  );
}

/**
 * The Audit **activity timeline**: a vertical, date-grouped feed of system
 * events. Semantic ordered lists (days -> events); each event is a real Link to
 * `/audit/{id}`. The rail + node colour is a restrained hint - the visible
 * title always carries the meaning. Backend order (newest first) is preserved.
 */
export function AuditTimeline({ events }: { events: AuditEventListItem[] }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];
  const groups = groupByDay(events);
  const lastKey = groups.at(-1)?.key;

  return (
    <ol className="flex flex-col gap-7">
      {groups.map((group) => {
        const lastEventId = group.events.at(-1)?.id;
        return (
          <li key={group.key}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label(locale, t)}
            </h3>
            <ol className="flex flex-col">
              {group.events.map((event) => {
                const isLast = group.key === lastKey && event.id === lastEventId;
                const { rail } = auditActionVisual(event.action);
                return (
                  <li key={event.id} className="group/row relative pb-4 pl-12 last:pb-0">
                    <span className="absolute left-0 top-0">
                      <AuditActionIcon action={event.action} />
                    </span>
                    {!isLast ? (
                      <span
                        aria-hidden="true"
                        data-timeline-rail
                        className={cn(
                          "absolute left-[17px] top-10 -bottom-1 w-0.5 rounded-full",
                          rail,
                        )}
                      />
                    ) : null}
                    <p className="mb-1 text-xs tabular-nums text-muted-foreground">
                      {timeOfDay(event.occurred_at, locale)}
                    </p>
                    <EventCard event={event} />
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
