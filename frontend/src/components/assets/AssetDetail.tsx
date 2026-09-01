"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowLeftIcon, PencilIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { deactivateAsset, reactivateAsset } from "@/services/assets";
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

function LifecycleAction({
  asset,
  onChanged,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = asset.is_active;

  async function run() {
    setBusy(true);
    setError(null);
    const res = active
      ? await deactivateAsset(asset.id)
      : await reactivateAsset(asset.id);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      onChanged(res.data);
    } else {
      setError(t("assetDetail.actionError"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {active
              ? t("assetDetail.deactivateConfirm")
              : t("assetDetail.reactivateConfirm")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={active ? "danger" : "primary"}
              size="sm"
              loading={busy}
              onClick={run}
            >
              {t("assetDetail.confirm")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t("assetForm.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant={active ? "secondary" : "primary"}
          size="sm"
          onClick={() => setConfirming(true)}
        >
          {active ? t("assetDetail.deactivate") : t("assetDetail.reactivate")}
        </Button>
      )}
    </div>
  );
}

export function AssetDetail({
  asset,
  onChanged,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
}) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

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
              <dl className="-mt-1">
                <Row label={t("assetFields.environment")}>
                  {environmentLabel(t, asset.environment)}
                </Row>
                <Row label={t("assetFields.hostname")}>
                  {asset.hostname ?? (
                    <span className="text-muted-foreground">{t("assetDetail.notSet")}</span>
                  )}
                </Row>
                <Row label={t("assetFields.ipAddress")}>
                  {asset.ip_address ? (
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {asset.ip_address}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">{t("assetDetail.notSet")}</span>
                  )}
                </Row>
                <Row label={t("assetFields.owner")}>
                  {asset.owner ?? (
                    <span className="text-muted-foreground">{t("assetDetail.notSet")}</span>
                  )}
                </Row>
                <Row label={t("assetFields.created")}>
                  {formatDateTime(asset.created_at, locale)}
                </Row>
                <Row label={t("assetFields.updated")}>
                  {formatDateTime(asset.updated_at, locale)}
                </Row>
                <Row label={t("assetFields.id")}>
                  <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {asset.id}
                  </code>
                </Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("assetDetail.description")}</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {asset.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("assetDetail.noDescription")}
                </p>
              )}
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
              <LifecycleAction asset={asset} onChanged={onChanged} />
            </CardContent>
          </Card>

          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("assetDetail.futureTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("assetDetail.futureBody")}
            </p>
            <Badge tone="neutral" className="mt-3 text-[10px]">
              Coming soon
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
