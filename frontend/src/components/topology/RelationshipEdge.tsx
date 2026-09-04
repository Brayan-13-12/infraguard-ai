"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import { cn } from "@/lib/cn";

const NON_PROPAGATING = new Set(["connects_to", "member_of"]);

export interface RelationshipEdgeData extends Record<string, unknown> {
  label: string;
  relationshipType: string;
  faded: boolean;
}

/**
 * Restrained, direction-aware edge (§28): a solid line for a relationship
 * type that propagates impact, a dashed line for a purely informational one
 * (`connects_to` / `member_of`) - never a colour-only distinction - with a
 * small always-visible label so the type is legible without hovering.
 */
export type RelationshipFlowEdge = Edge<RelationshipEdgeData, "relationship">;

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<RelationshipFlowEdge>) {
  const d = data;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const informational = NON_PROPAGATING.has(d?.relationshipType ?? "");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={cn(
          "!stroke-border",
          selected && "!stroke-primary",
          d?.faded && "opacity-30",
        )}
        style={{ strokeDasharray: informational ? "4 3" : undefined, strokeWidth: selected ? 2 : 1.5 }}
      />
      {d?.label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "pointer-events-none absolute rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
              selected && "text-primary",
              d.faded && "opacity-30",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
