"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { AssetForm } from "@/components/assets/AssetForm";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { BoxIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { getAsset, updateAsset } from "@/services/assets";
import type { Asset } from "@/types/asset";

type EditState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; asset: Asset };

function EditAssetContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [state, setState] = useState<EditState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getAsset(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ kind: "ready", asset: result.data });
      else setState({ kind: result.error.kind === "not_found" ? "notfound" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        description={state.kind === "notfound" ? t("assetDetail.notFoundBody") : undefined}
        action={
          <Link href="/assets" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            {t("assetDetail.backToList")}
          </Link>
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
          onSuccess={(asset) => router.push(`/assets/${asset.id}`)}
          onCancel={() => router.push(`/assets/${id}`)}
        />
      </Reveal>
    </div>
  );
}

export default function EditAssetPage() {
  return (
    <RequireAuth>
      <AppShell>
        <EditAssetContent />
      </AppShell>
    </RequireAuth>
  );
}
