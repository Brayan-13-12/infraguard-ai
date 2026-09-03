"use client";

import { AssetDetailLoader } from "@/components/assets/AssetDetailLoader";
import { AssetForm } from "@/components/assets/AssetForm";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { updateAsset } from "@/services/assets";

import { AssetDrawerShell } from "./AssetDrawerShell";

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Route-intercepted "Editar activo". Replaces the detail drawer in the same
 * modal slot (no modal-on-modal); `close` uses `router.back()` so the browser
 * naturally returns to the detail drawer, then the inventory.
 */
export function AssetEditDrawer({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer();

  return (
    <AssetDetailLoader
      id={id}
      render={({ state, reload }) => (
        <AssetDrawerShell
          label={t("assetForm.editTitle")}
          onClose={close}
          initialFocus='input[name="name"]'
          header={
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {t("assetForm.editTitle")}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {state.kind === "ready" ? state.asset.name : t("assetForm.editSubtitle")}
              </p>
            </div>
          }
        >
          {state.kind === "loading" ? (
            <FormSkeleton />
          ) : state.kind !== "ready" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {state.kind === "error"
                  ? t("assetDetail.loadError")
                  : state.kind === "gone"
                    ? t("assetDetail.inTrashTitle")
                    : t("assetDetail.notFoundTitle")}
              </p>
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
            <AssetForm
              mode="edit"
              initial={state.asset}
              onSubmit={(input) => updateAsset(id, input)}
              onSuccess={() => {
                notifyAssetsChanged();
                toast({ tone: "success", description: t("assetForm.updatedToast") });
                close();
              }}
              onCancel={close}
            />
          )}
        </AssetDrawerShell>
      )}
    />
  );
}
