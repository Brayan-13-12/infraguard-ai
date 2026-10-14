import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Connection, NodeChange, Viewport } from "@xyflow/react";
import { LanguageProvider } from "@/i18n";
import { TopologyCanvas, type TopologyCanvasHandle } from "@/components/topology/TopologyCanvas";
import type { AssetFlowNode } from "@/components/topology/AssetNode";
import * as layouts from "@/components/topology/layout";
import type { SubgraphResponse, TopologyNode } from "@/types/topology";

let flow: {
  nodes: AssetFlowNode[]; edges: { id: string }[]; viewport: Viewport; nodesConnectable: boolean;
  onConnect: (connection: Connection) => void; isValidConnection: (connection: Connection) => boolean;
  onNodeDragStart: () => void; onNodeDragStop: () => void; onNodesChange: (changes: NodeChange<AssetFlowNode>[]) => void;
};
const convert = vi.hoisted(() => vi.fn(({ x, y }: { x: number; y: number }) => ({ x: (x - 100) / 2, y: (y - 50) / 2 })));
vi.mock("@xyflow/react", async (original) => ({
  ...await original<typeof import("@xyflow/react")>(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  ReactFlow: (props: typeof flow & { children: React.ReactNode }) => { flow = props; return <div>{props.children}</div>; },
  useReactFlow: () => ({ screenToFlowPosition: convert }),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Background: () => null, Controls: () => null,
}));
const asset: TopologyNode = { id: "a", name: "api", asset_type: "Application", environment: "Production", criticality: "High", status: "Operational", is_active: true, is_root: false };
const graph: SubgraphResponse = { nodes: [asset], edges: [], root_asset_id: "", depth: 1, direction: "both", truncated: false, source: "postgres" };
const handle = createRef<TopologyCanvasHandle>();
const restore = vi.fn(), connect = vi.fn(), select = vi.fn();
const label = (type: string) => type;
const view = (data = graph, enabled = true, revision = 0) => <LanguageProvider><TopologyCanvas preservePositions ref={handle} data={data} persistedRevision={revision} onRestoreData={restore} onConnect={enabled ? connect : undefined} selectedNodeId={null} selectedEdgeId={null} onNodeSelect={select} onEdgeSelect={select} typeLabel={label} /></LanguageProvider>;
beforeEach(() => vi.clearAllMocks());

it("drops under the pointer after coordinate conversion, preserves layout, and supports undo/redo", async () => {
  const { rerender } = render(view());
  const original = flow.nodes[0];
  const viewport = flow.viewport;
  const layout = vi.spyOn(layouts, "layoutGraph");
  act(() => handle.current!.dropNode({ ...asset, id: "b" }, { x: 700, y: 450 }));
  const dropped = restore.mock.lastCall![0] as SubgraphResponse;
  rerender(view(dropped));
  expect(convert).toHaveBeenCalledWith({ x: 700, y: 450 });
  expect(flow.nodes[1]!.position).toEqual({ x: 240, y: 180 });
  expect(flow.nodes[0]).toBe(original);
  expect(flow.viewport).toEqual(viewport);
  expect(flow.edges).toHaveLength(0);
  expect(layout).not.toHaveBeenCalled();
  act(() => handle.current!.dropNode({ ...asset, id: "b" }, { x: 900, y: 900 }));
  expect(flow.nodes).toHaveLength(2);
  expect(flow.nodes[1]!.position).toEqual({ x: 240, y: 180 });
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(flow.nodes).toHaveLength(1);
  rerender(view(graph));
  await userEvent.click(screen.getByRole("button", { name: "Rehacer vista" }));
  expect(flow.nodes[1]!.position).toEqual({ x: 240, y: 180 });
  layout.mockRestore();
});

it("routes directed connections to confirmation without adding an edge and gates read-only canvases", () => {
  const data = { ...graph, nodes: [asset, { ...asset, id: "b" }] };
  const { rerender } = render(view(data));
  const connection = { source: "a", target: "b", sourceHandle: null, targetHandle: null };
  expect(flow.nodesConnectable).toBe(true);
  expect(flow.nodes[0]!.data.connectable).toBe(true);
  expect(flow.isValidConnection(connection)).toBe(true);
  act(() => flow.onConnect(connection));
  expect(connect).toHaveBeenCalledWith(connection);
  expect(flow.edges).toHaveLength(0);
  expect(flow.isValidConnection({ ...connection, target: "a" })).toBe(false);
  expect(flow.isValidConnection({ ...connection, target: "missing" })).toBe(false);
  rerender(view(data, false));
  expect(flow.nodesConnectable).toBe(false);
  expect(flow.nodes[0]!.data.connectable).toBe(false);
  act(() => flow.onConnect(connection));
  expect(connect).toHaveBeenCalledTimes(1);
});

it("keeps unrelated nodes stable during drag and clears visual history after a saved edge", async () => {
  const data = { ...graph, nodes: [asset, { ...asset, id: "b" }] };
  const { rerender } = render(view(data));
  const neighbor = flow.nodes[1];
  const layout = vi.spyOn(layouts, "layoutGraph");
  act(() => flow.onNodeDragStart());
  for (const x of [20, 30, 40]) {
    act(() => flow.onNodesChange([{ id: "a", type: "position", position: { x, y: 80 }, dragging: true }]));
    expect(flow.nodes[1]).toBe(neighbor);
  }
  act(() => flow.onNodeDragStop());
  expect(layout).not.toHaveBeenCalled();
  const saved = { ...data, edges: [{ id: "persisted", source_asset_id: "a", target_asset_id: "b", relationship_type: "uses" as const }] };
  rerender(view(saved, true, 1));
  expect(flow.nodes[0]!.position).toEqual({ x: 40, y: 80 });
  expect(screen.getByRole("button", { name: "Deshacer vista" })).toBeDisabled();
  act(() => handle.current!.resetView());
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(flow.edges[0]!.id).toBe("persisted");
  layout.mockRestore();
});

it("undoes click addition, removal and clearing with exact edges and positions", async () => {
  const { rerender } = render(view(graph));
  const original = flow.nodes[0];
  const added = { ...graph, nodes: [...graph.nodes, { ...asset, id: "b" }], edges: [{ id: "existing", source_asset_id: "a", target_asset_id: "b", relationship_type: "uses" as const }] };
  rerender(view(added));
  expect(flow.nodes[0]).toBe(original);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(flow.nodes).toHaveLength(1);
  rerender(view(graph));
  await userEvent.click(screen.getByRole("button", { name: "Rehacer vista" }));
  rerender(view(added));
  act(() => flow.onNodeDragStart());
  act(() => flow.onNodesChange([{ type: "position", id: "b", position: { x: 900, y: 340 }, dragging: true }]));
  act(() => flow.onNodeDragStop());
  const positions = flow.nodes.map((node) => node.position);
  rerender(view(graph));
  expect(flow.edges).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(flow.nodes.map((node) => node.position)).toEqual(positions);
  expect(flow.edges[0]!.id).toBe("existing");
  rerender(view(added));
  const cleared = { ...graph, nodes: [], edges: [] };
  rerender(view(cleared));
  expect(flow.nodes).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(flow.nodes.map((node) => node.position)).toEqual(positions);
  expect(flow.edges[0]!.id).toBe("existing");
});

it("a late canonical write after clear drops old undo snapshots without restoring nodes", () => {
  const { rerender } = render(view(graph));
  const empty = { ...graph, nodes: [], edges: [] };
  rerender(view(empty));
  expect(screen.getByRole("button", { name: "Deshacer vista" })).toBeEnabled();
  rerender(view({ ...empty }, true, 1));
  expect(flow.nodes).toHaveLength(0);
  expect(flow.edges).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Deshacer vista" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Rehacer vista" })).toBeDisabled();
});
