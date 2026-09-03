"use client";

import Link from "next/link";

import { CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { buttonClasses } from "@/components/ui/Button";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type { TrashAssetListItem } from "@/types/trash";

import { RestoreAction } from "./RestoreAction";
import { deletedByLine } from "./catalog";

export function TrashAssetsList({
  items,
  onChanged,
}: {
  items: TrashAssetListItem[];
  onChanged: () => void;
}) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&>th]:px-4 [&>th]:py-2.5">
              <th>{t("trash.columns.name")}</th>
              <th>{t("trash.columns.type")}</th>
              <th>{t("trash.columns.environment")}</th>
              <th>{t("trash.columns.criticality")}</th>
              <th>{t("trash.columns.deletedBy")}</th>
              <th className="whitespace-nowrap">{t("trash.columns.deletedAt")}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr
                key={a.id}
                className="border-b border-border last:border-0 [&>td]:px-4 [&>td]:py-3"
              >
                <td className="max-w-[18rem]">
                  <Link
                    href={`/trash/assets/${a.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {a.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {assetTypeLabel(t, a.asset_type)}
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {environmentLabel(t, a.environment)}
                </td>
                <td>
                  <CriticalityBadge value={a.criticality} />
                </td>
                <td className="max-w-[14rem] truncate text-muted-foreground">
                  {a.deleted_by_email ?? t("trash.deletedBySystem")}
                </td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {new Date(a.deleted_at).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/trash/assets/${a.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      {t("trash.view")}
                    </Link>
                    <RestoreAction kind="assets" id={a.id} label={a.name} onRestored={onChanged} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/trash/assets/${a.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {a.name}
              </Link>
              <CriticalityBadge value={a.criticality} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {assetTypeLabel(t, a.asset_type)} · {environmentLabel(t, a.environment)}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {deletedByLine(t, locale, a.deleted_at, a.deleted_by_email)}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Link
                href={`/trash/assets/${a.id}`}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                {t("trash.view")}
              </Link>
              <RestoreAction kind="assets" id={a.id} label={a.name} onRestored={onChanged} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
