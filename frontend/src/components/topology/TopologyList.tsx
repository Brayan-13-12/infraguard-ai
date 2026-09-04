"use client";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel } from "@/components/assets/catalog";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { AssetType } from "@/types/asset";
import type { SubgraphResponse } from "@/types/topology";

/**
 * Accessible list equivalent of the graph canvas (§58) - every node reachable
 * as a real, keyboard-focusable button, with its relationships listed as
 * plain text underneath. Selecting a row opens the same inspector the canvas
 * would.
 */
export function TopologyList({
  data,
  selectedNodeId,
  onSelect,
  typeLabel,
}: {
  data: SubgraphResponse;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  typeLabel: (type: string) => string;
}) {
  const { t } = useTranslation();
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  return (
    <ul className="h-full overflow-y-auto p-3">
      {data.nodes.map((node) => {
        const outgoing = data.edges.filter((e) => e.source_asset_id === node.id);
        const incoming = data.edges.filter((e) => e.target_asset_id === node.id);
        return (
          <li key={node.id} className="mb-2">
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              aria-current={node.id === selectedNodeId ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                node.id === selectedNodeId
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border bg-surface hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {node.name}
                  {node.is_root ? ` · ${t("topology.list.root")}` : ""}
                </span>
                <CriticalityBadge value={node.criticality as never} />
                <AssetStatusBadge value={node.status as never} />
              </span>
              <span className="text-xs text-muted-foreground">
                {assetTypeLabel(t, node.asset_type as AssetType)}
              </span>
              {outgoing.length || incoming.length ? (
                <span className="text-xs text-muted-foreground">
                  {outgoing.map((e) => {
                    const other = byId.get(e.target_asset_id);
                    return other
                      ? `${typeLabel(e.relationship_type)} ${other.name}`
                      : null;
                  })
                    .concat(
                      incoming.map((e) => {
                        const other = byId.get(e.source_asset_id);
                        return other ? `${other.name} ${typeLabel(e.relationship_type)}` : null;
                      }),
                    )
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
