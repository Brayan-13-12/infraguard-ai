"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { assetTypeLabel, criticalityLabel, statusLabel, CRITICALITY_TONE } from "@/components/assets/catalog";
import { AssetTypeIcon } from "./AssetTypeIcon";
import { cn } from "@/lib/cn";
import { useTranslation } from "@/i18n";
import { NODE_WIDTH, NODE_HEIGHT } from "./layout";
import type { AssetType, AssetStatus, Criticality } from "@/types/asset";

const ACCENT: Record<string, string> = {
  danger: "border-danger/60",
  warning: "border-warning/60",
  caution: "border-caution/60",
  success: "border-success/60",
};

const STATUS_DOT: Record<string, string> = {
  Operational: "bg-success",
  Degraded: "bg-warning",
  Maintenance: "bg-info",
  Offline: "bg-danger",
};

export interface AssetNodeData extends Record<string, unknown> {
  name: string;
  assetType: string;
  criticality: string;
  status: string;
  isActive: boolean;
  isRoot: boolean;
  faded: boolean;
  connectable?: boolean;
}

/**
 * Native InfraGuard graph node (§27): neutral surface, a criticality accent
 * bar (never one colour per asset type - only criticality/status carry
 * meaning), a small type icon, and a distinct focus/selection ring. Never
 * colour-only: criticality is labeled, the status dot has an accessible name,
 * and the full details remain available in the tooltip and inspector.
 */
export type AssetFlowNode = Node<AssetNodeData, "asset">;

export function AssetNode({ data, selected }: NodeProps<AssetFlowNode>) {
  const d = data;
  const { t } = useTranslation();
  const type = assetTypeLabel(t, d.assetType as AssetType) || d.assetType;
  const status = statusLabel(t, d.status as AssetStatus) || d.status;
  const criticality = criticalityLabel(t, d.criticality as Criticality) || d.criticality;
  const accent = ACCENT[CRITICALITY_TONE[d.criticality as Criticality] ?? "success"];
  const statusDot = STATUS_DOT[d.status] ?? "bg-muted-foreground";

  return (
    <div
      title={`${d.name} · ${type} · ${status} · ${criticality}${!d.isActive ? ` · ${t("common.inactive")}` : ""}`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn("group relative flex flex-col items-center", d.faded && "opacity-40")}
    >
      <div className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-surface text-foreground shadow-xs transition-shadow motion-reduce:transition-none",
        accent,
        selected ? "ring-4 ring-primary/30 outline outline-2 outline-offset-2 outline-primary" : d.isRoot && "ring-2 ring-primary/25",
        !d.isActive && "border-dashed opacity-60",
      )}>
        <Handle type="target" position={Position.Left} isConnectable={Boolean(d.connectable)} className={cn(
          d.connectable ? "!h-2.5 !w-2.5 !border !border-primary/60 !bg-surface !opacity-0 group-hover:!opacity-100 group-focus-within:!opacity-100 hover:!bg-primary" : "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground",
          d.connectable && selected && "!opacity-100",
        )} />
        <AssetTypeIcon type={d.assetType} />
        <span role="img" aria-label={status} className={cn("absolute bottom-0 right-0 h-2 w-2 rounded-full ring-2 ring-surface", statusDot)} />
        <Handle type="source" position={Position.Right} isConnectable={Boolean(d.connectable)} className={cn(
          d.connectable ? "!h-2.5 !w-2.5 !border !border-primary/60 !bg-surface !opacity-0 group-hover:!opacity-100 group-focus-within:!opacity-100 hover:!bg-primary" : "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground",
          d.connectable && selected && "!opacity-100",
        )} />
      </div>
      <span className={cn("mt-2 block w-full truncate text-center font-mono text-[11px] leading-4 text-foreground", selected && "font-semibold text-primary")}>
        {d.name}
      </span>
    </div>
  );
}
