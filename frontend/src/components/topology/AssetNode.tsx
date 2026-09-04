"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { CRITICALITY_TONE } from "@/components/assets/catalog";
import { BoxIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Criticality } from "@/types/asset";

const ACCENT: Record<string, string> = {
  danger: "border-l-danger",
  warning: "border-l-warning",
  caution: "border-l-caution",
  success: "border-l-success",
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
}

/**
 * Native InfraGuard graph node (§27): neutral surface, a criticality accent
 * bar (never one colour per asset type - only criticality/status carry
 * meaning), a small type icon, and a distinct focus/selection ring. Never
 * colour-only: the status dot always sits next to its own label text
 * elsewhere (the inspector), so this compact card is a summary, not the only
 * place status is legible.
 */
export type AssetFlowNode = Node<AssetNodeData, "asset">;

export function AssetNode({ data, selected }: NodeProps<AssetFlowNode>) {
  const d = data;
  const accent = ACCENT[CRITICALITY_TONE[d.criticality as Criticality] ?? "success"];
  const statusDot = STATUS_DOT[d.status] ?? "bg-muted-foreground";

  return (
    <div
      className={cn(
        "flex w-[220px] items-center gap-2 rounded-lg border border-l-4 bg-surface px-3 py-2.5 shadow-xs transition-shadow",
        accent,
        selected ? "outline outline-2 outline-offset-2 outline-ring" : "border-border",
        d.isRoot && "ring-2 ring-primary/50",
        d.faded && "opacity-40",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <BoxIcon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">{d.name}</span>
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot)}
            aria-hidden="true"
          />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{d.assetType}</span>
      </span>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}
