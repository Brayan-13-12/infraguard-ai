"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { AlertTriangleIcon, ArrowRightIcon, NetworkIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { getAssetImpact } from "@/services/topology";
import type { AssetType, Environment } from "@/types/asset";
import type { TopologyNode } from "@/types/topology";

/**
 * Node inspector (§29): name/criticality/status/type/environment,
 * incoming/outgoing counts, and the four actions the spec calls for. Reused
 * as a side panel on desktop and inside a `Drawer` bottom sheet on mobile by
 * the caller.
 */
export function NodeInspector({
  node,
  incomingCount,
  outgoingCount,
  onExpand,
  onFocus,
}: {
  node: TopologyNode;
  incomingCount: number;
  outgoingCount: number;
  onExpand: () => void;
  onFocus: () => void;
}) {
  const { t } = useTranslation();
  const [impact, setImpact] = useState<
    { kind: "loading" } | { kind: "ready"; count: number; names: string[] } | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    setImpact({ kind: "loading" });
    void getAssetImpact(node.id, 2).then((res) => {
      if (!res.ok) {
        setImpact({ kind: "error" });
        return;
      }
      setImpact({
        kind: "ready",
        count: res.data.affected_assets.length,
        names: res.data.affected_assets.slice(0, 5).map((a) => a.asset.name),
      });
    });
  }, [node.id]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{node.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {assetTypeLabel(t, node.asset_type as AssetType)} ·{" "}
          {environmentLabel(t, node.environment as Environment)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CriticalityBadge value={node.criticality as never} />
        <AssetStatusBadge value={node.status as never} />
        {!node.is_active ? (
          <span className="text-xs text-muted-foreground">{t("common.inactive")}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("topology.inspector.upstream")}</dt>
          <dd className="tabular-nums font-medium text-foreground">{outgoingCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("topology.inspector.downstream")}</dt>
          <dd className="tabular-nums font-medium text-foreground">{incomingCount}</dd>
        </div>
      </dl>

      <div className="rounded-lg border border-border p-3">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          {t("topology.inspector.impactTitle")}
        </h3>
        {impact.kind === "loading" ? (
          <Skeleton className="h-4 w-32" />
        ) : impact.kind === "error" ? (
          <p className="text-xs text-muted-foreground">{t("topology.inspector.impactError")}</p>
        ) : impact.count === 0 ? (
          <p className="text-xs text-muted-foreground">{t("topology.inspector.impactNone")}</p>
        ) : (
          <p className="text-xs text-foreground">
            {t("topology.inspector.impactCount", { count: impact.count })}
            {impact.names.length ? `: ${impact.names.join(", ")}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href={`/assets/${node.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("topology.inspector.viewAsset")}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
        <Button variant="secondary" size="sm" onClick={onFocus}>
          {t("topology.inspector.center")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onExpand}>
          <NetworkIcon className="h-4 w-4" />
          {t("topology.inspector.expand")}
        </Button>
      </div>
    </div>
  );
}
