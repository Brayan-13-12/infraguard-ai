"use client";

import { AssetForm } from "@/components/assets/AssetForm";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { createAsset } from "@/services/assets";

/**
 * Route-intercepted "Nuevo activo" - a **centered modal** over the inventory
 * (the list stays mounted behind it). Same `WorkspaceDialog` chrome as the
 * detail workspace, in its smaller `modal` variant. `AssetForm` is used
 * verbatim; the full-page fallback at `/assets/new` renders the same form.
 */
export function AssetCreateWorkspace() {
  const { t } = useTranslation();
  const close = useCloseDrawer("/assets");

  return (
    <WorkspaceDialog
      variant="modal"
      label={t("assetForm.createTitle")}
      onClose={close}
      initialFocus='input[name="name"]'
      header={
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
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
    </WorkspaceDialog>
  );
}
