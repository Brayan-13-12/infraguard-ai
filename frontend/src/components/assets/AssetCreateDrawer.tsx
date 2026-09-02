"use client";

import { AssetForm } from "@/components/assets/AssetForm";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { createAsset } from "@/services/assets";

import { AssetDrawerShell } from "./AssetDrawerShell";

/** Route-intercepted "Nuevo activo", shown as a drawer over the inventory. */
export function AssetCreateDrawer() {
  const { t } = useTranslation();
  const close = useCloseDrawer();

  return (
    <AssetDrawerShell
      label={t("assetForm.createTitle")}
      onClose={close}
      initialFocus='input[name="name"]'
      header={
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t("assetForm.createTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("assetForm.createSubtitle")}
          </p>
        </div>
      }
    >
      <AssetForm
        mode="create"
        onSubmit={createAsset}
        onSuccess={(asset) => {
          notifyAssetsChanged({ focusId: asset.id });
          toast({ tone: "success", description: t("assetForm.createdToast") });
          close();
        }}
        onCancel={close}
      />
    </AssetDrawerShell>
  );
}
