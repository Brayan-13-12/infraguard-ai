"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { ChevronRightIcon, PencilIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Asset } from "@/types/asset";

import { AssetStatusBadge, CriticalityBadge } from "./AssetBadges";
import { assetTypeLabel, environmentLabel } from "./catalog";

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The asset name is the one real `<Link>` (accessible name, new-tab, keyboard).
 * Its `::after` is stretched over the whole row / card so the entire surface is
 * clickable; interactive elements that must stay independently clickable get
 * `relative z-[1]` to sit above the stretched hit area.
 */
function NameLink({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        href={`/assets/${asset.id}`}
        className="truncate font-mono text-[13px] font-medium text-foreground underline-offset-4 after:absolute after:inset-0 group-hover/row:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {asset.name}
      </Link>
      {!asset.is_active ? (
        <Badge tone="neutral" className="relative z-[1] shrink-0 text-[10px]">
          {t("assets.inactiveBadge")}
        </Badge>
      ) : null}
    </span>
  );
}

function EditAction({ asset, className }: { asset: Asset; className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/assets/${asset.id}/edit`}
      aria-label={`${t("assetDetail.edit")}: ${asset.name}`}
      className={cn(
        "relative z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <PencilIcon className="h-3.5 w-3.5" />
    </Link>
  );
}

export function AssetsTable({
  assets,
  highlightId,
}: {
  assets: Asset[];
  /** Briefly highlight this row (e.g. a just-created asset). */
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
              <th>{t("assetFields.name")}</th>
              <th>{t("assetFields.type")}</th>
              <th>{t("assetFields.environment")}</th>
              <th>{t("assetFields.criticality")}</th>
              <th>{t("assetFields.status")}</th>
              <th>{t("assetFields.owner")}</th>
              <th className="whitespace-nowrap">{t("assetFields.updated")}</th>
              <th aria-hidden="true" className="w-16" />
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.id}
                className={cn(
                  "group/row relative cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40",
                  "[&>td]:px-4 [&>td]:py-3.5 xl:[&>td]:px-5",
                  highlightId === asset.id && "bg-primary/[0.06]",
                  !asset.is_active && "opacity-60",
                )}
              >
                <td className="max-w-[24rem]">
                  <NameLink asset={asset} />
                </td>
                <td className="text-muted-foreground">
                  {assetTypeLabel(t, asset.asset_type)}
                </td>
                <td className="text-muted-foreground">
                  {environmentLabel(t, asset.environment)}
                </td>
                <td>
                  <CriticalityBadge value={asset.criticality} />
                </td>
                <td>
                  <AssetStatusBadge value={asset.status} />
                </td>
                <td className="text-muted-foreground">{asset.owner ?? "—"}</td>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(asset.updated_at, locale)}
                </td>
                <td className="text-right">
                  <span className="flex items-center justify-end gap-0.5">
                    <EditAction
                      asset={asset}
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
        {assets.map((asset) => (
          <li
            key={asset.id}
            className={cn(
              "group/row relative rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-primary/30 active:bg-muted/30",
              highlightId === asset.id && "border-primary/40 bg-primary/[0.06]",
              !asset.is_active && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <NameLink asset={asset} />
              <span className="relative z-[1] flex items-center gap-1">
                <CriticalityBadge value={asset.criticality} />
                <EditAction asset={asset} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t("assetFields.type")}</dt>
                <dd className="text-foreground">{assetTypeLabel(t, asset.asset_type)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("assetFields.environment")}</dt>
                <dd className="text-foreground">{environmentLabel(t, asset.environment)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("assetFields.status")}</dt>
                <dd className="mt-0.5">
                  <AssetStatusBadge value={asset.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("assetFields.owner")}</dt>
                <dd className="text-foreground">{asset.owner ?? "—"}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
