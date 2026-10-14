"use client";

import "@xyflow/react/dist/style.css";

import {
  applyNodeChanges,
  useReactFlow,
  ConnectionMode,
  type Connection,
  type XYPosition,
  type Viewport,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { Select } from "@/components/ui/Select";
import { useVisualHistory } from "./useVisualHistory";
import type { SubgraphResponse, TopologyNode } from "@/types/topology";

import { AssetNode, type AssetFlowNode } from "./AssetNode";
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT, type GraphLayout } from "./layout";
import { RelationshipEdge, type RelationshipFlowEdge } from "./RelationshipEdge";

const NODE_TYPES = { asset: AssetNode };
const EDGE_TYPES = { relationship: RelationshipEdge };

export interface TopologyCanvasHandle {
  fitView: () => void;
  resetView: () => void;
  centerNode: (id: string) => void;
  dropNode: (node: TopologyNode, screenPosition: XYPosition) => void;
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

  return { nodes, edges };
}

function isNeighbor(nodeId: string, focusId: string | null, data: SubgraphResponse): boolean {
  if (!focusId) return true;
  return data.edges.some(
    (e) =>
      (e.source_asset_id === focusId && e.target_asset_id === nodeId) ||
      (e.target_asset_id === focusId && e.source_asset_id === nodeId),
  );
}

interface CanvasProps {
  data: SubgraphResponse;
  persistedRevision?: number;
  preservePositions?: boolean;
  onConnect?: (connection: Connection) => void;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onNodeSelect: (id: string | null) => void;
  onEdgeSelect: (id: string | null) => void;
  typeLabel: (type: string) => string;
  onRestoreData?: (data: SubgraphResponse) => void;
}
interface Presentation {
  graph: SubgraphResponse;
  nodes: AssetFlowNode[];
  layout: GraphLayout;
  viewport: Viewport;
}

function Inner({ data, persistedRevision = 0, selectedNodeId, selectedEdgeId, onNodeSelect, onEdgeSelect, typeLabel, onRestoreData, onConnect, preservePositions = false }: CanvasProps,
  ref: React.Ref<TopologyCanvasHandle>) {
  const { t } = useTranslation();
  const connectable = Boolean(onConnect);
  const { screenToFlowPosition } = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const initial = useMemo<Presentation>(() => ({
    graph: data, nodes: layoutGraph(toFlowGraph(data, null, null, typeLabel).nodes, data.edges.map((edge) => ({ id: edge.id, source: edge.source_asset_id, target: edge.target_asset_id }))),
    layout: "hierarchical", viewport: { x: 0, y: 0, zoom: 1 },
    // Initial state only. Fresh data is handled as a single visual operation below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const history = useVisualHistory(initial);
  const revision = useRef(persistedRevision);
  const presentation = history.positions;
  function fitted(nodes: AssetFlowNode[]): Viewport {
    if (!nodes.length) return history.get().viewport;
    const width = container.current?.clientWidth || 800, height = container.current?.clientHeight || 600;
    const left = Math.min(...nodes.map((n) => n.position.x)), top = Math.min(...nodes.map((n) => n.position.y));
    const right = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH)), bottom = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT));
    const zoom = Math.max(0.15, Math.min(1.5, width * 0.8 / (right - left), height * 0.8 / (bottom - top)));
    return { x: width / 2 - (left + right) / 2 * zoom, y: height / 2 - (top + bottom) / 2 * zoom, zoom };
  }
  function change(update: Partial<Presentation>) { history.begin(); history.move(update); history.commit(); }
  useEffect(() => {
    const current = history.get();
    if (revision.current !== persistedRevision) {
      revision.current = persistedRevision;
      // A canonical write is a history boundary, never an undoable visual operation.
      const known = new Map(current.nodes.map((node) => [node.id, node]));
      const converted = toFlowGraph(data, null, null, typeLabel);
      const positioned = data.nodes.some((node) => !known.has(node.id))
        ? layoutGraph(converted.nodes, converted.edges, current.layout) : converted.nodes;
      history.reset({ ...current, graph: data, nodes: positioned.map((node) => known.get(node.id) ?? node) });
      return;
    }
    if (current.graph === data) return;
    const converted = toFlowGraph(data, null, null, typeLabel);
    if (preservePositions) {
      const known = new Map(current.nodes.map((node) => [node.id, node]));
      let nextX = current.nodes.length ? Math.max(...current.nodes.map((node) => node.position.x)) + NODE_WIDTH + 60 : 80;
      const nodes = converted.nodes.map((node) => {
        const existing = known.get(node.id);
        if (existing) return existing;
        const added = { ...node, position: { x: nextX, y: 80 } };
        nextX += NODE_WIDTH + 60;
        return added;
      });
      change({ graph: data, nodes });
    } else {
      const nodes = layoutGraph(converted.nodes, converted.edges, current.layout);
      change({ graph: data, nodes, viewport: fitted(nodes) });
    }
    // API reads/expansions change visible data; restore uses the same snapshot reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, persistedRevision]);
  useEffect(() => {
    history.reset({ ...history.get(), viewport: fitted(history.get().nodes) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useImperativeHandle(ref, () => ({
    dropNode: (node, screenPosition) => {
      const current = history.get();
      if (current.graph.nodes.some((item) => item.id === node.id)) return;
      const point = screenToFlowPosition(screenPosition);
      const graph = { ...current.graph, nodes: [...current.graph.nodes, node] };
      const added = toFlowGraph({ ...graph, nodes: [node] }, null, null, typeLabel).nodes[0]!;
      // Keep the icon under the pointer; preserve all existing positions and viewport.
      added.position = { x: point.x - NODE_WIDTH / 2, y: point.y - 20 };
      change({ graph, nodes: [...current.nodes, added] });
      onRestoreData?.(graph);
    },
    fitView: () => change({ viewport: fitted(history.get().nodes) }),
    resetView: () => change({ viewport: { x: 0, y: 0, zoom: 1 } }),
    centerNode: (id) => {
      const current = history.get(), node = current.nodes.find((item) => item.id === id);
      if (!node) return;
      const zoom = current.viewport.zoom;
      change({ viewport: { zoom, x: (container.current?.clientWidth || 800) / 2 - (node.position.x + NODE_WIDTH / 2) * zoom,
        y: (container.current?.clientHeight || 600) / 2 - (node.position.y + 20) * zoom } });
    },
  }));
  const cache = useRef(new Map<string, { base: AssetFlowNode; rendered: AssetFlowNode }>());
  const nodes = useMemo(() => {
    const next = new Map<string, { base: AssetFlowNode; rendered: AssetFlowNode }>();
    const result = presentation.nodes.map((node) => {
      const selected = node.id === selectedNodeId;
      const faded = selectedNodeId !== null && !selected && !isNeighbor(node.id, selectedNodeId, presentation.graph);
      const old = cache.current.get(node.id);
      const rendered = old && old.base === node && old.rendered.selected === selected && old.rendered.data.faded === faded && old.rendered.data.connectable === connectable
        ? old.rendered : { ...node, selected, data: { ...node.data, faded, connectable } };
      next.set(node.id, { base: node, rendered });
      return rendered;
    });
    cache.current = next;
    return result;
  }, [presentation.nodes, presentation.graph, selectedNodeId, connectable]);
  const edges = useMemo(() => toFlowGraph(presentation.graph, selectedNodeId, selectedEdgeId, typeLabel).edges,
    [presentation.graph, selectedNodeId, selectedEdgeId, typeLabel]);
  function restore(direction: "undo" | "redo") {
    history[direction]();
    const restored = history.get().graph;
    if (restored !== data) onRestoreData?.(restored);
    if (selectedNodeId && !restored.nodes.some((node) => node.id === selectedNodeId)) onNodeSelect(null);
    if (selectedEdgeId && !restored.edges.some((edge) => edge.id === selectedEdgeId)) onEdgeSelect(null);
  }
  return (
    <div ref={container} className="h-full w-full">
    <ReactFlow
      nodes={nodes} edges={edges} viewport={presentation.viewport}
      onViewportChange={(viewport) => history.move({ viewport })}
      onMoveStart={(event) => { if (event) history.begin(); }} onMoveEnd={(event) => { if (event) history.commit(); }}
      onNodesChange={(changes) => {
        const updates = changes.filter((item) => item.type === "position" || item.type === "dimensions");
        if (!updates.length) return;
        const standalone = !dragging.current && updates.some((item) => item.type === "position" && item.position);
        if (standalone) history.begin();
        history.move({ nodes: applyNodeChanges(updates, history.get().nodes) });
        if (standalone) history.commit();
      }}
      onNodeDragStart={() => { dragging.current = true; history.begin(); }}
      onNodeDragStop={() => {
        dragging.current = false;
        // Never retain a transient dragging flag in an undo/redo snapshot.
        const stopped = history.get().nodes.map((node) => node.dragging ? { ...node, dragging: false } : node);
        history.move({ nodes: stopped });
        history.commit();
      }}
      deleteKeyCode={null} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
      onNodeClick={(_event, node) => onNodeSelect(node.id)}
      onEdgeClick={(_event, edge) => onEdgeSelect(edge.id)}
      onPaneClick={() => { onNodeSelect(null); onEdgeSelect(null); }}
      proOptions={{ hideAttribution: true }} minZoom={0.15} maxZoom={2}
      connectionMode={ConnectionMode.Strict}
      isValidConnection={(connection) => Boolean(onConnect) && connection.source !== connection.target &&
        presentation.graph.nodes.some((node) => node.id === connection.source) &&
        presentation.graph.nodes.some((node) => node.id === connection.target)}
      onConnect={(connection) => {
        if (onConnect && connection.source !== connection.target &&
          history.get().graph.nodes.some((node) => node.id === connection.source) &&
          history.get().graph.nodes.some((node) => node.id === connection.target)) onConnect(connection);
      }}
      nodesDraggable nodesConnectable={Boolean(onConnect)} elementsSelectable className="bg-background"
    >
      <Panel position="top-right" className="!m-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-end gap-1 rounded-lg border border-border bg-surface p-2 shadow-xs">
        <Select label={t("topology.toolbar.layout")} value={presentation.layout}
          options={[{ value: "hierarchical", label: t("topology.toolbar.hierarchical") }, { value: "radial", label: t("topology.toolbar.radial") }, { value: "organic", label: t("topology.toolbar.organic") }]}
          onChange={(event) => {
            const layout = event.target.value as GraphLayout;
            const current = history.get();
            const positioned = layoutGraph(current.nodes, edges, layout);
            change({ layout, nodes: positioned, viewport: fitted(positioned) });
          }} />
        <Button variant="ghost" size="sm" disabled={!history.canUndo} onClick={() => restore("undo")} title={t("topology.toolbar.undo")}>
          <ArrowLeftIcon className="h-4 w-4" />{t("topology.toolbar.undo")}
        </Button>
        <Button variant="ghost" size="sm" disabled={!history.canRedo} onClick={() => restore("redo")} title={t("topology.toolbar.redo")}>
          <ArrowRightIcon className="h-4 w-4" />{t("topology.toolbar.redo")}
        </Button>
      </Panel>
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} className="opacity-25" />
      <Controls position="bottom-left" showInteractive={false} showFitView={false}
        className="!rounded-lg !border !border-border !bg-surface !shadow-sm [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground [&_button:hover]:!bg-muted" />
    </ReactFlow>
    </div>
  );
}
const InnerWithRef = forwardRef(Inner);
export const TopologyCanvas = forwardRef<TopologyCanvasHandle, CanvasProps>(function TopologyCanvas(props, ref) {
  return <ReactFlowProvider><InnerWithRef {...props} ref={ref} /></ReactFlowProvider>;
});
