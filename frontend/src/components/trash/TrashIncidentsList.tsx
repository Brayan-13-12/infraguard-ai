"use client";

import Link from "next/link";

import { IncidentStatusBadge, PriorityBadge, SeverityBadge } from "@/components/incidents/IncidentBadges";
import { buttonClasses } from "@/components/ui/Button";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type { TrashIncidentListItem } from "@/types/trash";

import { RestoreAction } from "./RestoreAction";
import { deletedByLine } from "./catalog";

export function TrashIncidentsList({
  items,
  onChanged,
}: {
  items: TrashIncidentListItem[];
  onChanged: () => void;
}) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&>th]:px-4 [&>th]:py-2.5">
              <th>{t("trash.columns.title")}</th>
              <th>{t("trash.columns.severity")}</th>
              <th>{t("trash.columns.status")}</th>
              <th>{t("trash.columns.priority")}</th>
              <th>{t("trash.columns.deletedBy")}</th>
              <th className="whitespace-nowrap">{t("trash.columns.deletedAt")}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {items.map((inc) => (
              <tr
                key={inc.id}
                className="border-b border-border last:border-0 [&>td]:px-4 [&>td]:py-3"
              >
                <td className="max-w-[20rem]">
                  <Link
                    href={`/trash/incidents/${inc.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {inc.title}
                  </Link>
                </td>
                <td>
                  <SeverityBadge value={inc.severity} />
                </td>
                <td>
                  <IncidentStatusBadge value={inc.status} />
                </td>
                <td>
                  <PriorityBadge value={inc.priority} />
                </td>
                <td className="max-w-[14rem] truncate text-muted-foreground">
                  {inc.deleted_by_email ?? t("trash.deletedBySystem")}
                </td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {new Date(inc.deleted_at).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/trash/incidents/${inc.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      {t("trash.view")}
                    </Link>
                    <RestoreAction
                      kind="incidents"
                      id={inc.id}
                      label={inc.title}
                      onRestored={onChanged}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {items.map((inc) => (
          <li key={inc.id} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/trash/incidents/${inc.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {inc.title}
              </Link>
              <SeverityBadge value={inc.severity} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <IncidentStatusBadge value={inc.status} />
              <PriorityBadge value={inc.priority} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {deletedByLine(t, locale, inc.deleted_at, inc.deleted_by_email)}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Link
                href={`/trash/incidents/${inc.id}`}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                {t("trash.view")}
              </Link>
              <RestoreAction
                kind="incidents"
                id={inc.id}
                label={inc.title}
                onRestored={onChanged}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
