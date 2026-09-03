"use client";

import Link from "next/link";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { Alert } from "@/components/ui/Alert";
import { DetailRow, NotSet } from "@/components/ui/DetailRow";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type { TrashAssetDetail as TrashAsset } from "@/types/trash";

import { formatDateTime } from "./catalog";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </code>
  );
}

/** Read-only body for a trashed asset. No inline editing while in Trash. */
export function TrashAssetDetailContent({ asset }: { asset: TrashAsset }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="warning">{t("trashDetail.readOnlyNotice")}</Alert>

      <section>
        <dl className="-mt-1">
          <DetailRow label={t("assetFields.name")}>{asset.name}</DetailRow>
          <DetailRow label={t("assetFields.type")}>
            {assetTypeLabel(t, asset.asset_type)}
          </DetailRow>
          <DetailRow label={t("assetFields.environment")}>
            {environmentLabel(t, asset.environment)}
          </DetailRow>
          <DetailRow label={t("assetFields.criticality")}>
            <CriticalityBadge value={asset.criticality} />
          </DetailRow>
          <DetailRow label={t("assetFields.status")}>
            <AssetStatusBadge value={asset.status} />
          </DetailRow>
          <DetailRow label={t("assetFields.hostname")}>
            {asset.hostname ?? <NotSet label={t("assetDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("assetFields.ipAddress")}>
            {asset.ip_address ? <Code>{asset.ip_address}</Code> : <NotSet label={t("assetDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("assetFields.owner")}>
            {asset.owner ?? <NotSet label={t("assetDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("assetFields.description")}>
            {asset.description ? (
              <span className="whitespace-pre-wrap">{asset.description}</span>
            ) : (
              <NotSet label={t("assetDetail.noDescription")} />
            )}
          </DetailRow>
        </dl>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("trashDetail.deletedSection")}
        </h3>
        <dl className="-mt-1">
          <DetailRow label={t("trashDetail.deletedBy")}>
            {asset.deleted_by_email ?? <NotSet label={t("trash.deletedBySystem")} />}
          </DetailRow>
          <DetailRow label={t("trashDetail.deletedAt")}>
            {formatDateTime(asset.deleted_at, locale)}
          </DetailRow>
          <DetailRow label={t("assetFields.created")}>
            {formatDateTime(asset.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("assetFields.updated")}>
            {formatDateTime(asset.updated_at, locale)}
          </DetailRow>
          <DetailRow label={t("assetFields.id")}>
            <Code>{asset.id}</Code>
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}

/** Full-page trashed-asset detail - deep-link / refresh fallback. */
export function TrashAssetDetailPage({
  asset,
  actions,
}: {
  asset: TrashAsset;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/trash"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("trashDetail.backToList")}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {asset.name}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("trashDetail.assetTitle")}</p>
        </div>
        {actions}
      </header>
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <TrashAssetDetailContent asset={asset} />
      </div>
    </div>
  );
}
