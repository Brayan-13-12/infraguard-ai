"use client";

import Link from "next/link";

import {
  AssetDescription,
  AssetLifecycleButton,
  AssetOverview,
} from "@/components/assets/AssetDetail";
import { AssetDetailLoader } from "@/components/assets/AssetDetailLoader";
import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel } from "@/components/assets/catalog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PencilIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import type { Asset } from "@/types/asset";

import { AssetDrawerShell } from "./AssetDrawerShell";

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,160px)_1fr]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
      <Skeleton className="mt-2 h-16 w-full" />
    </div>
  );
}

function ReadyBody({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      {!asset.is_active ? (
        <Alert tone="warning">{t("assetDetail.inactiveNotice")}</Alert>
      ) : null}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("assetDetail.overview")}
        </h3>
        <AssetOverview asset={asset} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("assetDetail.description")}
        </h3>
        <AssetDescription asset={asset} />
      </section>
    </div>
  );
}

/** Route-intercepted asset detail, shown as a right drawer over the inventory. */
export function AssetDetailDrawer({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer();

  return (
    <AssetDetailLoader
      id={id}
      render={({ state, reload, setAsset }) => {
        const asset = state.kind === "ready" ? state.asset : null;

        const header = (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {asset ? asset.name : t("assetDetail.overview")}
              </h2>
              {asset && !asset.is_active ? (
                <Badge tone="neutral" className="text-[10px]">
                  {t("assets.inactiveBadge")}
                </Badge>
              ) : null}
            </div>
            {asset ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {assetTypeLabel(t, asset.asset_type)}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">
                  ·
                </span>
                <CriticalityBadge value={asset.criticality} />
                <AssetStatusBadge value={asset.status} />
              </div>
            ) : null}
          </div>
        );

        const footer = asset ? (
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/assets/${asset.id}/edit`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <PencilIcon />
              {t("assetDetail.edit")}
            </Link>
            <AssetLifecycleButton asset={asset} onChanged={setAsset} />
          </div>
        ) : undefined;

        return (
          <AssetDrawerShell
            label={asset ? asset.name : t("assetDetail.overview")}
            header={header}
            footer={footer}
            onClose={close}
          >
            {state.kind === "loading" ? (
              <DrawerSkeleton />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  {state.kind === "notfound"
                    ? t("assetDetail.notFoundTitle")
                    : t("assetDetail.loadError")}
                </p>
                {state.kind === "notfound" ? (
                  <p className="max-w-xs text-sm text-muted-foreground">
                    {t("assetDetail.notFoundBody")}
                  </p>
                ) : null}
                <div className="mt-1 flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={close}>
                    {t("overlay.close")}
                  </Button>
                </div>
              </div>
            ) : (
              <ReadyBody asset={state.asset} />
            )}
          </AssetDrawerShell>
        );
      }}
    />
  );
}
