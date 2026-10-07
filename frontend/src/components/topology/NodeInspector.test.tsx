import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import * as topology from "@/services/topology";
import type { TopologyNode } from "@/types/topology";
import { NodeInspector } from "./NodeInspector";

const node: TopologyNode = { id: "a", name: "API", asset_type: "Application", environment: "Production", criticality: "High", status: "Operational", is_active: true, is_root: false };
const view = (selected: TopologyNode) => <LanguageProvider><MockAuthProvider user={makeUser()}><NodeInspector node={selected} incomingCount={0} outgoingCount={0} onFocus={() => {}} onExpand={() => {}} /></MockAuthProvider></LanguageProvider>;
afterEach(() => vi.restoreAllMocks());
it.each(["success", "failure"] as const)("ignores an obsolete impact %s after the node changes", async (kind) => {
  let finish!: (result: Awaited<ReturnType<typeof topology.getAssetImpact>>) => void;
  vi.spyOn(topology, "getAssetImpact")
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce({ ok: true, data: { root_asset_id: "b", max_depth: 2, source: "postgres", truncated: false, affected_assets: [{ asset: { ...node, id: "current", name: "Current impact" }, distance: 1, path: ["b", "current"] }] } });
  const { rerender } = render(view(node));
  rerender(view({ ...node, id: "b", name: "Database" }));
  expect(await screen.findByText(/Current impact/)).toBeInTheDocument();
  await act(async () => finish(kind === "success" ? { ok: true, data: { root_asset_id: "a", max_depth: 2, source: "postgres", truncated: false, affected_assets: [] } } : { ok: false, error: { kind: "unreachable" } }));
  expect(screen.getByText(/Current impact/)).toBeInTheDocument();
});
