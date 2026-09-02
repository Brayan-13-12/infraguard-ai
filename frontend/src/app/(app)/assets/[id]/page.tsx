"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AssetDetail } from "@/components/assets/AssetDetail";
import { AssetDetailLoader } from "@/components/assets/AssetDetailLoader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { BoxIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/** Full-page asset detail - the deep-link / refresh fallback for the drawer. */
export default function AssetDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  return (
    <AssetDetailLoader
      id={id}
      render={({ state, reload, setAsset }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind === "notfound" || state.kind === "error") {
          return (
            <EmptyState
              icon={<BoxIcon />}
              title={
                state.kind === "notfound"
                  ? t("assetDetail.notFoundTitle")
                  : t("assetDetail.loadError")
              }
              description={
                state.kind === "notfound" ? t("assetDetail.notFoundBody") : undefined
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
          <Reveal>
            <AssetDetail asset={state.asset} onChanged={setAsset} />
          </Reveal>
        );
      }}
    />
  );
}
