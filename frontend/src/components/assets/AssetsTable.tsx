"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
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

function NameCell({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        href={`/assets/${asset.id}`}
        className="truncate font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {asset.name}
      </Link>
      {!asset.is_active ? (
        <Badge tone="neutral" className="shrink-0 text-[10px]">
          {t("assets.inactiveBadge")}
        </Badge>
      ) : null}
    </span>
  );
}

export function AssetsTable({ assets }: { assets: Asset[] }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <>
      {/* Desktop / wide: a real table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground [&>th]:px-4 [&>th]:py-3 xl:[&>th]:px-5">
              <th>{t("assetFields.name")}</th>
              <th>{t("assetFields.type")}</th>
              <th>{t("assetFields.environment")}</th>
              <th>{t("assetFields.criticality")}</th>
              <th>{t("assetFields.status")}</th>
              <th>{t("assetFields.owner")}</th>
              <th className="whitespace-nowrap">{t("assetFields.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.id}
                className={cn(
                  "border-b border-border last:border-0 transition-colors hover:bg-muted/40",
                  "[&>td]:px-4 [&>td]:py-3.5 xl:[&>td]:px-5",
                  !asset.is_active && "opacity-60",
                )}
              >
                <td className="max-w-[24rem]">
                  <NameCell asset={asset} />
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
                <td className="whitespace-nowrap text-muted-foreground">
                  {formatDate(asset.updated_at, locale)}
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
              "rounded-xl border border-border bg-surface p-4 shadow-sm",
              !asset.is_active && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <NameCell asset={asset} />
              <CriticalityBadge value={asset.criticality} />
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
