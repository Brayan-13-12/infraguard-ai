"use client";

import { useRouter } from "next/navigation";

import { AssetForm } from "@/components/assets/AssetForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { createAsset } from "@/services/assets";

/** Full-page "Nuevo activo" - the deep-link / refresh fallback for the drawer. */
export default function NewAssetPage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Reveal>
        <PageHeader
          title={t("assetForm.createTitle")}
          description={t("assetForm.createSubtitle")}
        />
      </Reveal>
      <Reveal delayMs={60}>
        <AssetForm
          mode="create"
          onSubmit={createAsset}
          onSuccess={(asset) => {
            notifyAssetsChanged({ focusId: asset.id });
            toast({ tone: "success", description: t("assetForm.createdToast") });
            router.push("/assets");
          }}
          onCancel={() => router.push("/assets")}
        />
      </Reveal>
    </div>
  );
}
