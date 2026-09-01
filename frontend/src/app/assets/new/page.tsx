"use client";

import { useRouter } from "next/navigation";

import { RequireAuth } from "@/components/RequireAuth";
import { AssetForm } from "@/components/assets/AssetForm";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { useTranslation } from "@/i18n";
import { createAsset } from "@/services/assets";

function NewAssetContent() {
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
          onSuccess={(asset) => router.push(`/assets/${asset.id}`)}
          onCancel={() => router.push("/assets")}
        />
      </Reveal>
    </div>
  );
}

export default function NewAssetPage() {
  return (
    <RequireAuth>
      <AppShell>
        <NewAssetContent />
      </AppShell>
    </RequireAuth>
  );
}
