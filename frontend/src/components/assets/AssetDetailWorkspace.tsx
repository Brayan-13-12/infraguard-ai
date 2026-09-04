"use client";

import {
  AssetDetailBadges,
  AssetDetailContent,
  AssetLifecycleButton,
  MoveToTrashButton,
} from "@/components/assets/AssetDetail";
import { AskAiButton } from "@/components/ai/AskAiButton";
import { AssetDetailLoader } from "@/components/assets/AssetDetailLoader";
import { InTrashNotice } from "@/components/trash/InTrashNotice";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-9 w-64" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Route-aware Asset detail workspace: a large centered dialog opened by an
 * intercepting route over the still-mounted inventory. The same
 * {@link AssetDetailContent} powers the full-page fallback at `/assets/[id]`.
 */
export function AssetDetailWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/assets");

  return (
    <AssetDetailLoader
      id={id}
      render={({ state, reload, setAsset }) => {
        const asset = state.kind === "ready" ? state.asset : null;

        const header = (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {asset ? asset.name : t("assetDetail.overview")}
            </h2>
            {asset ? <AssetDetailBadges asset={asset} /> : null}
          </div>
        );

        const footer = asset ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AskAiButton entity={{ type: "asset", id: asset.id }} />
            <div className="flex items-center gap-3">
              <MoveToTrashButton asset={asset} onDeleted={close} />
              <AssetLifecycleButton asset={asset} onChanged={setAsset} />
            </div>
          </div>
        ) : undefined;

        return (
          <WorkspaceDialog
            label={asset ? asset.name : t("assetDetail.overview")}
            header={header}
            footer={footer}
            onClose={close}
          >
            {state.kind === "loading" ? (
              <WorkspaceSkeleton />
            ) : state.kind === "gone" ? (
              <InTrashNotice kind="assets" compact />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
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
              <AssetDetailContent asset={state.asset} onChanged={setAsset} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}
