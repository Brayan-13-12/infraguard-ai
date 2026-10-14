import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 64;
export type GraphLayout = "hierarchical" | "radial" | "organic";

/**
 * Deterministic left-to-right layered layout via dagre. Recomputed whenever
 * the node/edge *set* changes (fresh root fetch or a merged expansion) - never
 * animated between layouts, so it stays predictable rather than "prettified".
 */
export function layoutGraph<FlowNode extends Node>(
  nodes: FlowNode[],
  edges: Edge[],
  layout: GraphLayout = "hierarchical",
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  if (layout !== "hierarchical") {
    const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const root = sorted.find((node) => node.data.isRoot) ?? sorted[0]!;
    const depth = new Map<string, number>([[root.id, 0]]);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      for (const edge of edges) {
        const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
        if (neighbor && !depth.has(neighbor)) { depth.set(neighbor, depth.get(id)! + 1); queue.push(neighbor); }
      }
    }
    // Undirected distance is used for placement only; edge endpoints never change.
    const rings = new Map<number, FlowNode[]>();
    const disconnected = Math.max(...depth.values()) + 1;
    for (const node of sorted) {
      const ring = depth.get(node.id) ?? disconnected;
      rings.set(ring, [...(rings.get(ring) ?? []), node]);
    }
    const points = new Map<string, { x: number; y: number }>();
    let previousRadius = 0;
    for (const [ring, members] of [...rings].sort(([a], [b]) => a - b)) {
      const radius = ring === 0 ? 0 : Math.max(previousRadius + 170, members.length * (NODE_WIDTH + 24) / (2 * Math.PI));
      previousRadius = radius;
      members.forEach((node, i) => {
        const angle = i * 2 * Math.PI / members.length - Math.PI / 2;
        points.set(node.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
      });
    }
    if (layout === "organic") {
      // Bounded deterministic force layout, run only on explicit layout/data changes.
      for (let step = 0; step < 100; step++) {
        const force = new Map(sorted.map((node) => [node.id, { x: 0, y: 0 }]));
        for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i]!.id, b = sorted[j]!.id;
          const pa = points.get(a)!, pb = points.get(b)!;
          const dx = pa.x - pb.x || 0.1, dy = pa.y - pb.y || 0.1;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const magnitude = 18000 / (distance * distance);
          force.get(a)!.x += dx / distance * magnitude; force.get(a)!.y += dy / distance * magnitude;
          force.get(b)!.x -= dx / distance * magnitude; force.get(b)!.y -= dy / distance * magnitude;
        }
        for (const edge of edges) {
          const a = points.get(edge.source), b = points.get(edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const magnitude = (distance - 190) * 0.025;
          force.get(edge.source)!.x += dx / distance * magnitude; force.get(edge.source)!.y += dy / distance * magnitude;
          force.get(edge.target)!.x -= dx / distance * magnitude; force.get(edge.target)!.y -= dy / distance * magnitude;
        }
        for (const node of sorted) {
          const point = points.get(node.id)!, delta = force.get(node.id)!;
          point.x += Math.max(-8, Math.min(8, delta.x)); point.y += Math.max(-8, Math.min(8, delta.y));
        }
      }
    }
    return nodes.map((node) => ({ ...node, position: points.get(node.id)! }));
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 88, edgesep: 20, marginx: 32, marginy: 32, ranker: "network-simplex" });

  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}
