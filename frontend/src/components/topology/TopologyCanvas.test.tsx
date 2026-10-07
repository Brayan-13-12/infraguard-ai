import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createRef } from "react";
import * as layouts from "./layout";
import type { Node, NodeChange, Viewport } from "@xyflow/react";
import { LanguageProvider } from "@/i18n";
import type { SubgraphResponse } from "@/types/topology";
import { TopologyCanvas, type TopologyCanvasHandle } from "./TopologyCanvas";

let canvas: {
  nodes: Node[];
  edges: { id: string }[];
  viewport: Viewport;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeDragStart: () => void;
  onNodeDragStop: (event: unknown, node: Node, nodes: Node[]) => void;
};
const flow = vi.hoisted(() => ({ fitView: vi.fn(), setViewport: vi.fn() }));
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@xyflow/react")>(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  ReactFlow: (props: typeof canvas & { children: React.ReactNode }) => { canvas = props; return <div>{props.children}</div>; },
  useReactFlow: () => flow,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Background: () => null, Controls: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" }, BackgroundVariant: { Dots: "dots" },
}));

const data = {
  nodes: [{ id: "a", name: "api", asset_type: "Application", criticality: "High", status: "Operational", is_active: true, is_root: true }],
  edges: [], truncated: false,
} as unknown as SubgraphResponse;
const select = vi.fn();
const label = (type: string) => type;
const restore = vi.fn();
const handle = createRef<TopologyCanvasHandle>();
beforeEach(() => vi.clearAllMocks());
const view = (selectedNodeId: string | null = null, graph = data, persistedRevision = 0) => <LanguageProvider><TopologyCanvas persistedRevision={persistedRevision} ref={handle} onRestoreData={restore} data={graph} selectedNodeId={selectedNodeId} selectedEdgeId={null} onNodeSelect={select} onEdgeSelect={select} typeLabel={label} /></LanguageProvider>;

it("keeps a canonical new edge outside visual history while preserving the current presentation", async () => {
  const graph = { ...data, nodes: [...data.nodes, { ...data.nodes[0]!, id: "b", name: "db" }] };
  const { rerender } = render(view(null, graph));
  act(() => canvas.onNodeDragStart());
  act(() => canvas.onNodesChange([{ type: "position", id: "a", position: { x: 300, y: 120 }, dragging: true }]));
  act(() => canvas.onNodeDragStop(null, canvas.nodes[0]!, canvas.nodes));
  const viewport = canvas.viewport;
  const saved = { ...graph, edges: [{ id: "saved", source_asset_id: "a", target_asset_id: "b", relationship_type: "uses" as const }] };
  rerender(view(null, saved, 1));
  expect(canvas.nodes[0]!.position).toEqual({ x: 300, y: 120 });
  expect(canvas.viewport).toEqual(viewport);
  expect(canvas.edges[0]!.id).toBe("saved");
  expect(screen.getByRole("button", { name: "Deshacer vista" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Rehacer vista" })).toBeDisabled();
  act(() => handle.current!.resetView());
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.edges[0]!.id).toBe("saved");
  expect(restore).not.toHaveBeenCalled();
});

it("wires a drag to Undo/Redo and keeps local positions when the inspector selection changes", async () => {
  const { rerender } = render(view());
  const original = { ...canvas.nodes[0]!.position };
  expect(screen.getByRole("button", { name: "Deshacer vista" })).toBeDisabled();
  act(() => canvas.onNodeDragStart());
  act(() => canvas.onNodesChange([{ type: "position", id: "a", position: { x: 300, y: 120 }, dragging: true }]));
  act(() => canvas.onNodeDragStop(null, canvas.nodes[0]!, canvas.nodes));
  rerender(view("a"));
  expect(canvas.nodes[0]!.position).toEqual({ x: 300, y: 120 });
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.nodes[0]!.position).toEqual(original);
  await userEvent.click(screen.getByRole("button", { name: "Rehacer vista" }));
  expect(canvas.nodes[0]!.position).toEqual({ x: 300, y: 120 });

});

it("retains unrelated node identity and does not run layout during drag updates", () => {
  const graph = { ...data, nodes: [...data.nodes, { ...data.nodes[0]!, id: "b", name: "db" }] };
  render(view(null, graph));
  const unchanged = canvas.nodes.find((node) => node.id === "b");
  const layout = vi.spyOn(layouts, "layoutGraph");
  layout.mockClear();
  act(() => canvas.onNodeDragStart());
  for (let x = 100; x < 110; x++) {
    act(() => canvas.onNodesChange([{ type: "position", id: "a", position: { x, y: 120 }, dragging: true }]));
    expect(canvas.nodes.find((node) => node.id === "b")).toBe(unchanged);
    expect(canvas.nodes.find((node) => node.id === "a")!.dragging).toBe(true);
  }
  act(() => canvas.onNodesChange([{ type: "position", id: "a", position: { x: 110, y: 120 }, dragging: false }]));
  act(() => canvas.onNodeDragStop(null, canvas.nodes[0]!, canvas.nodes));
  expect(layout).not.toHaveBeenCalled();
  layout.mockRestore();
});

it("undoes and redoes visible neighbor expansion without a database operation", async () => {
  const { rerender } = render(view());
  const expanded = { ...data, nodes: [...data.nodes, { ...data.nodes[0]!, id: "b", name: "neighbor" }] };
  rerender(view(null, expanded));
  expect(canvas.nodes).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.nodes).toHaveLength(1);
  expect(restore).toHaveBeenLastCalledWith(data);
  // Model the parent's restoration of inspector/list data.
  rerender(view(null, data));
  await userEvent.click(screen.getByRole("button", { name: "Rehacer vista" }));
  expect(canvas.nodes).toHaveLength(2);
  expect(restore).toHaveBeenLastCalledWith(expanded);
});

it("records layout, center, reset and fit as reversible presentation changes", async () => {
  const graph = { ...data, nodes: [...data.nodes, { ...data.nodes[0]!, id: "b", name: "db", is_root: false }] };
  render(view(null, graph));
  const original = canvas.nodes.map((node) => node.position);
  await userEvent.selectOptions(screen.getByRole("combobox"), "radial");
  const radial = canvas.nodes.map((node) => node.position);
  expect(radial).not.toEqual(original);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.nodes.map((node) => node.position)).toEqual(original);
  expect(screen.getByRole("combobox")).toHaveValue("hierarchical");
  await userEvent.click(screen.getByRole("button", { name: "Rehacer vista" }));
  expect(canvas.nodes.map((node) => node.position)).toEqual(radial);
  const beforeCenter = { ...canvas.viewport };
  act(() => handle.current!.centerNode("a"));
  expect(canvas.viewport).not.toEqual(beforeCenter);
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.viewport).toEqual(beforeCenter);
  act(() => handle.current!.resetView());
  expect(canvas.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  act(() => handle.current!.fitView());
  expect(canvas.viewport).not.toEqual({ x: 0, y: 0, zoom: 1 });
  await userEvent.click(screen.getByRole("button", { name: "Deshacer vista" }));
  expect(canvas.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
});
