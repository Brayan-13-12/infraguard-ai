"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AssetDetailLoader } from "@/components/assets/AssetDetailLoader";
import { AssetForm } from "@/components/assets/AssetForm";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { BoxIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { updateAsset } from "@/services/assets";

/** Full-page "Editar activo" - the deep-link / refresh fallback for the drawer. */
export default function EditAssetPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <AssetDetailLoader
      id={id}
      render={({ state, reload }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind !== "ready") {
          return (
            <EmptyState
              icon={<BoxIcon />}
              title={
                state.kind === "error"
                  ? t("assetDetail.loadError")
                  : state.kind === "gone"
                    ? t("assetDetail.inTrashTitle")
                    : t("assetDetail.notFoundTitle")
              }
              description={
                state.kind === "gone"
                  ? t("assetDetail.inTrashBody")
                  : state.kind === "notfound"
                    ? t("assetDetail.notFoundBody")
                    : undefined
              }
              action={
                <div className="flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("common.retry")}
                    </Button>
                  ) : null}
                  <Link
                    href="/assets"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("assetDetail.backToList")}
                  </Link>
                </div>
              }
            />
          );
        }
        return (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <Reveal>
              <PageHeader
                title={t("assetForm.editTitle")}
                description={t("assetForm.editSubtitle")}
              />
            </Reveal>
            <Reveal delayMs={60}>
              <AssetForm
                mode="edit"
                initial={state.asset}
                onSubmit={(input) => updateAsset(id, input)}
                onSuccess={(asset) => {
                  notifyAssetsChanged();
                  toast({ tone: "success", description: t("assetForm.updatedToast") });
                  router.push(`/assets/${asset.id}`);
                }}
                onCancel={() => router.push(`/assets/${id}`)}
              />
            </Reveal>
          </div>
        );
      }}
    />
  );
}
