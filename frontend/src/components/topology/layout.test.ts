import type { Node, Edge } from "@xyflow/react";
import { expect, it } from "vitest";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "./layout";

const nodes: Node[] = ["web", "api", "db", "worker"].map((id) => ({ id, position: { x: 0, y: 0 }, data: {} }));
const edges: Edge[] = [
  { id: "a", source: "web", target: "api" },
  { id: "b", source: "api", target: "db" },
  { id: "c", source: "worker", target: "db" },
];

it.each(["radial", "organic"] as const)("%s repositions the visible graph without modifying nodes or recorded directions", (mode) => {
  const input = JSON.stringify({ nodes, edges });
  const result = layoutGraph(nodes, edges, mode);
  expect(result.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
  expect(result.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
  expect(result.map((node) => node.position)).toEqual(layoutGraph(nodes, edges, mode).map((node) => node.position));
  expect(result.map((node) => node.position)).not.toEqual(layoutGraph(nodes, edges).map((node) => node.position));
  expect(JSON.stringify({ nodes, edges })).toBe(input);
  expect(layoutGraph([], [], mode)).toEqual([]);
  expect(layoutGraph(nodes, [], mode)).toHaveLength(nodes.length);
});

it("lays out recorded direction in separated left-to-right layers without mutating inputs", () => {
  const result = layoutGraph(nodes, edges);
  for (const edge of edges) {
    expect(result.find((n) => n.id === edge.source)!.position.x + NODE_WIDTH)
      .toBeLessThan(result.find((n) => n.id === edge.target)!.position.x);
  }
  for (const a of result) for (const b of result) {
    if (a.id === b.id) continue;
    expect(Math.abs(a.position.x - b.position.x) >= NODE_WIDTH || Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT).toBe(true);
  }
  expect(nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
  expect(edges[0]).toEqual({ id: "a", source: "web", target: "api" });
});

it("keeps positions stable across API ordering and handles cycles and disconnected nodes", () => {
  const positions = (value: Node[]) => Object.fromEntries(value.map((n) => [n.id, n.position]));
  expect(positions(layoutGraph(nodes, edges))).toEqual(positions(layoutGraph([...nodes].reverse(), [...edges].reverse())));
  const result = layoutGraph(nodes, [...edges, { id: "cycle", source: "db", target: "web" }]);
  expect(result.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  expect(layoutGraph([], [])).toEqual([]);
  expect(layoutGraph(nodes, [])).toHaveLength(nodes.length);
});
