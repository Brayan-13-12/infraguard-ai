"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import type { SubgraphResponse } from "@/types/topology";

import { AssetNode, type AssetFlowNode } from "./AssetNode";
import { layoutGraph } from "./layout";
import { RelationshipEdge, type RelationshipFlowEdge } from "./RelationshipEdge";

const NODE_TYPES = { asset: AssetNode };
const EDGE_TYPES = { relationship: RelationshipEdge };

export interface TopologyCanvasHandle {
  fitView: () => void;
  resetView: () => void;
}

function toFlowGraph(
  data: SubgraphResponse,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  typeLabel: (type: string) => string,
): { nodes: AssetFlowNode[]; edges: RelationshipFlowEdge[] } {
  const hasSelection = selectedNodeId !== null;
  const nodes: AssetFlowNode[] = data.nodes.map((n) => ({
    id: n.id,
    type: "asset",
    position: { x: 0, y: 0 },
    selected: n.id === selectedNodeId,
    data: {
      name: n.name,
      assetType: n.asset_type,
      criticality: n.criticality,
      status: n.status,
      isActive: n.is_active,
      isRoot: n.is_root,
      faded: hasSelection && n.id !== selectedNodeId && !isNeighbor(n.id, selectedNodeId, data),
    },
  }));

  const edges: RelationshipFlowEdge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source_asset_id,
    target: e.target_asset_id,
    type: "relationship",
    selected: e.id === selectedEdgeId,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    data: {
      label: typeLabel(e.relationship_type),
      relationshipType: e.relationship_type,
      faded:
        hasSelection &&
        e.source_asset_id !== selectedNodeId &&
        e.target_asset_id !== selectedNodeId,
    },
  }));

  return { nodes: layoutGraph(nodes, edges), edges };
}

function isNeighbor(nodeId: string, focusId: string | null, data: SubgraphResponse): boolean {
  if (!focusId) return true;
  return data.edges.some(
    (e) =>
      (e.source_asset_id === focusId && e.target_asset_id === nodeId) ||
      (e.target_asset_id === focusId && e.source_asset_id === nodeId),
  );
}

function Inner(
  {
    data,
    selectedNodeId,
    selectedEdgeId,
    onNodeSelect,
    onEdgeSelect,
    typeLabel,
  }: {
    data: SubgraphResponse;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    onNodeSelect: (id: string | null) => void;
    onEdgeSelect: (id: string | null) => void;
    typeLabel: (type: string) => string;
  },
  ref: React.Ref<TopologyCanvasHandle>,
) {
  const flow = useReactFlow();
  const firstFit = useRef(true);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  const { nodes, edges } = useMemo(
    () => toFlowGraph(data, selectedNodeId, selectedEdgeId, typeLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selectedNodeId, selectedEdgeId],
  );

  useEffect(() => {
    // Fit on every fresh node/edge SET change (not on mere selection), and
    // always (no animation) the very first time to avoid an initial jump.
    const duration = reducedMotion.current || firstFit.current ? 0 : 200;
    flow.fitView({ padding: 0.2, duration });
    firstFit.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useImperativeHandle(ref, () => ({
    fitView: () => flow.fitView({ padding: 0.2, duration: reducedMotion.current ? 0 : 200 }),
    resetView: () => flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: reducedMotion.current ? 0 : 200 }),
  }));

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={(_e, node) => onNodeSelect(node.id)}
      onEdgeClick={(_e, edge) => onEdgeSelect(edge.id)}
      onPaneClick={() => {
        onNodeSelect(null);
        onEdgeSelect(null);
      }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.15}
      maxZoom={2}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
      <Controls
        position="bottom-left"
        showInteractive={false}
        className="!rounded-lg !border !border-border !bg-surface !shadow-sm [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground [&_button:hover]:!bg-muted"
      />
    </ReactFlow>
  );
}

const InnerWithRef = forwardRef(Inner);

export const TopologyCanvas = forwardRef<
  TopologyCanvasHandle,
  {
    data: SubgraphResponse;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    onNodeSelect: (id: string | null) => void;
    onEdgeSelect: (id: string | null) => void;
    typeLabel: (type: string) => string;
  }
>(function TopologyCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <InnerWithRef {...props} ref={ref} />
    </ReactFlowProvider>
  );
});
