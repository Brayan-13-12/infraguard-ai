"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ArrowLeftIcon, PencilIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { deactivateAsset, reactivateAsset } from "@/services/assets";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import type { Asset } from "@/types/asset";

import { AssetStatusBadge, CriticalityBadge } from "./AssetBadges";
import { assetTypeLabel, environmentLabel } from "./catalog";

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:items-baseline sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

const notSet = (text: string) => <span className="text-muted-foreground">{text}</span>;

/** The overview `<dl>` - shared by the full page and the drawer. */
export function AssetOverview({ asset }: { asset: Asset }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];
  return (
    <dl className="-mt-1">
      <Row label={t("assetFields.environment")}>{environmentLabel(t, asset.environment)}</Row>
      <Row label={t("assetFields.hostname")}>
        {asset.hostname ?? notSet(t("assetDetail.notSet"))}
      </Row>
      <Row label={t("assetFields.ipAddress")}>
        {asset.ip_address ? (
          <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {asset.ip_address}
          </code>
        ) : (
          notSet(t("assetDetail.notSet"))
        )}
      </Row>
      <Row label={t("assetFields.owner")}>{asset.owner ?? notSet(t("assetDetail.notSet"))}</Row>
      <Row label={t("assetFields.created")}>{formatDateTime(asset.created_at, locale)}</Row>
      <Row label={t("assetFields.updated")}>{formatDateTime(asset.updated_at, locale)}</Row>
      <Row label={t("assetFields.id")}>
        <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {asset.id}
        </code>
      </Row>
    </dl>
  );
}

/** Description block - shared. */
export function AssetDescription({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return asset.description ? (
    <p className="whitespace-pre-wrap text-sm text-foreground">{asset.description}</p>
  ) : (
    <p className="text-sm text-muted-foreground">{t("assetDetail.noDescription")}</p>
  );
}

/**
 * Deactivate / reactivate behind a {@link ConfirmDialog}. On success it reports
 * the updated asset, tells the inventory list to refetch, and toasts. Shared by
 * the full page and the drawer footer.
 */
export function AssetLifecycleButton({
  asset,
  onChanged,
  size = "sm",
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = asset.is_active;

  async function run() {
    setBusy(true);
    setError(null);
    const res = active ? await deactivateAsset(asset.id) : await reactivateAsset(asset.id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      onChanged(res.data);
      notifyAssetsChanged();
      toast({
        tone: active ? "warning" : "success",
        description: active
          ? t("assetDetail.deactivatedToast")
          : t("assetDetail.reactivatedToast"),
      });
    } else {
      setError(t("assetDetail.actionError"));
    }
  }

  return (
    <>
      <Button
        variant={active ? "secondary" : "primary"}
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {active ? t("assetDetail.deactivate") : t("assetDetail.reactivate")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={active ? t("assetDetail.deactivate") : t("assetDetail.reactivate")}
        description={
          active ? t("assetDetail.deactivateConfirm") : t("assetDetail.reactivateConfirm")
        }
        confirmLabel={t("assetDetail.confirm")}
        cancelLabel={t("assetForm.cancel")}
        tone={active ? "danger" : "primary"}
        loading={busy}
        error={error}
      />
    </>
  );
}

/**
 * Full-page asset detail. The drawer reuses {@link AssetOverview},
 * {@link AssetDescription} and {@link AssetLifecycleButton} directly.
 */
export function AssetDetail({
  asset,
  onChanged,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/assets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("assetDetail.backToList")}
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {asset.name}
          </h1>
          {!asset.is_active ? (
            <Badge tone="neutral">{t("assets.inactiveBadge")}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {assetTypeLabel(t, asset.asset_type)}
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <CriticalityBadge value={asset.criticality} />
          <AssetStatusBadge value={asset.status} />
        </div>
      </header>

      {!asset.is_active ? (
        <Alert tone="warning">{t("assetDetail.inactiveNotice")}</Alert>
      ) : null}

      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1.7fr_1fr] lg:items-start xl:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("assetDetail.overview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AssetOverview asset={asset} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("assetDetail.description")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AssetDescription asset={asset} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("assetDetail.actions")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Link
                href={`/assets/${asset.id}/edit`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                <PencilIcon />
                {t("assetDetail.edit")}
              </Link>
              <AssetLifecycleButton asset={asset} onChanged={onChanged} />
            </CardContent>
          </Card>

          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("assetDetail.futureTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("assetDetail.futureBody")}</p>
            <Badge tone="neutral" className="mt-3 text-[10px]">
              Coming soon
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
