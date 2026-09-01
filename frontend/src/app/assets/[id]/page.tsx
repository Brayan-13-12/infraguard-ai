"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { AssetDetail } from "@/components/assets/AssetDetail";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { BoxIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { getAsset } from "@/services/assets";
import type { Asset } from "@/types/asset";

type DetailState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; asset: Asset };

function AssetDetailContent() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
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
    <Reveal>
      <AssetDetail
        asset={state.asset}
        onChanged={(asset) => setState({ kind: "ready", asset })}
      />
    </Reveal>
  );
}

export default function AssetDetailPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AssetDetailContent />
      </AppShell>
    </RequireAuth>
  );
}
