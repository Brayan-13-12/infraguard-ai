import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TopologyWorkspace } from "@/components/topology/TopologyWorkspace";
import { LanguageProvider } from "@/i18n";
import * as assetsService from "@/services/assets";
import * as relationshipsService from "@/services/relationships";
import * as topologyService from "@/services/topology";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import type { AssetRelationshipsGrouped, AssetSummary, RelationshipDetail } from "@/types/relationship";
import type { SubgraphResponse, TopologyEdge, TopologyNode } from "@/types/topology";

// The graph canvas is a third-party library (React Flow) - per the brief,
// mock only the heavy rendering, not the application behavior around it.
// This stand-in exposes the same props contract as the real TopologyCanvas
// so TopologyWorkspace's orchestration (fetch, select, expand, filters,
// list-view toggle) is exercised for real.
vi.mock("./TopologyCanvas", () => ({
  TopologyCanvas: forwardRef(function MockTopologyCanvas(
    props: {
      data: SubgraphResponse;
      onNodeSelect: (id: string | null) => void;
      onEdgeSelect: (id: string | null) => void;
    },
    ref: React.Ref<{ fitView: () => void; resetView: () => void }>,
  ) {
    useImperativeHandle(ref, () => ({ fitView: vi.fn(), resetView: vi.fn() }));
    return (
      <div data-testid="topology-canvas">
        {props.data.nodes.map((n) => (
          <button key={n.id} type="button" onClick={() => props.onNodeSelect(n.id)}>
            {n.name}
          </button>
        ))}
        {props.data.edges.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-label={`edge-${e.id}`}
            onClick={() => props.onEdgeSelect(e.id)}
          >
            edge-{e.id}
          </button>
        ))}
      </div>
    );
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

let mockSearchParams = new URLSearchParams("");
const replace = vi.fn((url: string) => {
  const i = url.indexOf("?");
  mockSearchParams = new URLSearchParams(i >= 0 ? url.slice(i + 1) : "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/topology",
  useSearchParams: () => mockSearchParams,
}));

function node(over: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: "a1",
    name: "prod-api-01",
    asset_type: "Application",
    environment: "Production",
    criticality: "Critical",
    status: "Operational",
    is_active: true,
    is_root: false,
    ...over,
  };
}

function edge(over: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id: "e1",
    source_asset_id: "a1",
    target_asset_id: "a2",
    relationship_type: "depends_on",
    ...over,
  };
}

function subgraph(over: Partial<SubgraphResponse> = {}): SubgraphResponse {
  return {
    root_asset_id: "a1",
    nodes: [node({ id: "a1", name: "prod-api-01", is_root: true }), node({ id: "a2", name: "prod-db-primary" })],
    edges: [edge()],
    depth: 1,
    direction: "both",
    truncated: false,
    source: "postgres",
    ...over,
  };
}

function assetSummary(over: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: "a2",
    name: "prod-db-primary",
    hostname: null,
    asset_type: "Database",
    environment: "Production",
    criticality: "Critical",
    status: "Operational",
    is_active: true,
    ...over,
  };
}

function relationshipDetail(over: Partial<RelationshipDetail> = {}): RelationshipDetail {
  return {
    id: "e1",
    source_asset_id: "a1",
    target_asset_id: "a2",
    relationship_type: "depends_on",
    description: "Depende para leer/escribir datos.",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    source: assetSummary({ id: "a1", name: "prod-api-01" }),
    target: assetSummary(),
    ...over,
  };
}

function grouped(over: Partial<AssetRelationshipsGrouped> = {}): AssetRelationshipsGrouped {
  return {
    outgoing: [relationshipDetail()],
    incoming: [],
    counts: { outgoing: 1, incoming: 0, total: 1 },
    ...over,
  };
}

function mockImpactEmpty() {
  vi.spyOn(topologyService, "getAssetImpact").mockResolvedValue({
    ok: true,
    data: { root_asset_id: "a1", affected_assets: [], max_depth: 2, truncated: false, source: "postgres" },
  });
}

function renderWorkspace(user = makeUser()) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <TopologyWorkspace />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  mockSearchParams = new URLSearchParams("");
  replace.mockClear();
});

describe("TopologyWorkspace", () => {
  it("shows the no-focus empty state when there is no asset in the URL", async () => {
    renderWorkspace();
    expect(await screen.findByText("Ningún activo seleccionado")).toBeInTheDocument();
    expect(screen.getByText("Busca un activo para ver su topología de dependencias.")).toBeInTheDocument();
  });

  it("shows a loading state while the subgraph is fetched", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockImplementation(() => new Promise(() => {}));
    const { container } = renderWorkspace();
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeInTheDocument());
  });

  it("loads and renders the subgraph for the focused asset", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    const getSubgraph = vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: true,
      data: subgraph(),
    });

    renderWorkspace();

    const canvas = await screen.findByTestId("topology-canvas");
    expect(within(canvas).getByText("prod-api-01")).toBeInTheDocument();
    expect(within(canvas).getByText("prod-db-primary")).toBeInTheDocument();
    expect(getSubgraph).toHaveBeenCalledWith(
      expect.objectContaining({ rootAssetId: "a1", depth: 1, direction: "both" }),
    );
  });

  it("selecting a node shows the node inspector with its counts and actions", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();

    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByText("prod-api-01"));

    const aside = await screen.findByRole("complementary");
    expect(within(aside).getByText("prod-api-01")).toBeInTheDocument();
    expect(within(aside).getByRole("link", { name: /ver activo/i })).toHaveAttribute(
      "href",
      "/assets/a1",
    );
    expect(within(aside).getByRole("button", { name: /centrar/i })).toBeInTheDocument();
    expect(within(aside).getByRole("button", { name: /expandir vecinos/i })).toBeInTheDocument();
  });

  it("selecting an edge shows the edge inspector with source, type and target", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped(),
    });

    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByRole("button", { name: "edge-e1" }));

    const aside = await screen.findByRole("complementary");
    await within(aside).findByText("Relación");
    expect(within(aside).getByText("prod-api-01")).toBeInTheDocument();
    expect(within(aside).getByText("Depende de")).toBeInTheDocument();
    expect(within(aside).getByText("prod-db-primary")).toBeInTheDocument();
    expect(within(aside).getByText("Depende para leer/escribir datos.")).toBeInTheDocument();
  });

  it("expands neighbors and merges the new nodes without refetching everything", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    const getSubgraph = vi
      .spyOn(topologyService, "getSubgraph")
      .mockResolvedValueOnce({ ok: true, data: subgraph() })
      .mockResolvedValueOnce({
        ok: true,
        data: subgraph({
          nodes: [
            node({ id: "a1", name: "prod-api-01", is_root: true }),
            node({ id: "a3", name: "prod-cache-01" }),
          ],
          edges: [edge({ id: "e2", target_asset_id: "a3" })],
        }),
      });
    mockImpactEmpty();

    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByText("prod-api-01"));
    const aside = await screen.findByRole("complementary");
    await userEvent.click(within(aside).getByRole("button", { name: /expandir vecinos/i }));

    await waitFor(() => expect(getSubgraph).toHaveBeenCalledTimes(2));
    expect(within(canvas).getByText("prod-cache-01")).toBeInTheDocument();
    // the merge keeps the originally loaded node too
    expect(within(canvas).getByText("prod-db-primary")).toBeInTheDocument();
  });

  it("searching and selecting an asset focuses it and updates the URL", async () => {
    vi.spyOn(assetsService, "listAssets").mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "a2",
            name: "prod-db-primary",
            asset_type: "Database",
            environment: "Production",
            criticality: "Critical",
            status: "Operational",
            hostname: null,
            ip_address: null,
            owner: null,
            description: null,
            is_active: true,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
        page: 1,
        page_size: 8,
        total: 1,
        total_pages: 1,
      },
    });
    const getSubgraph = vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: true,
      data: subgraph({ root_asset_id: "a2" }),
    });

    renderWorkspace();
    const searchInputs = screen.getAllByPlaceholderText(/buscar por nombre, hostname o ip/i);
    await userEvent.type(searchInputs[0]!, "prod-db");

    const result = await screen.findByText("prod-db-primary", {}, { timeout: 2000 });
    await userEvent.click(result);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining("asset_id=a2"), expect.anything()));
    await waitFor(() =>
      expect(getSubgraph).toHaveBeenCalledWith(expect.objectContaining({ rootAssetId: "a2" })),
    );
  });

  it("changing the relationship type filter re-fetches with that filter applied", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    const getSubgraph = vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: true,
      data: subgraph(),
    });

    renderWorkspace();
    await screen.findByTestId("topology-canvas");
    await userEvent.click(screen.getByRole("button", { name: /^filtros$/i }));
    const select = screen.getByRole("combobox", { name: /tipo de relación/i });
    await userEvent.selectOptions(select, "Depende de");

    await waitFor(() =>
      expect(getSubgraph).toHaveBeenLastCalledWith(
        expect.objectContaining({ relationshipType: ["depends_on"] }),
      ),
    );
  });

  it("shows the truncated warning when the backend caps the result", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: true,
      data: subgraph({ truncated: true }),
    });

    renderWorkspace();
    expect(
      await screen.findByText(/se muestran los primeros elementos/i),
    ).toBeInTheDocument();
  });

  it("toggles to the accessible list view and allows selecting a node from it", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();

    renderWorkspace();
    await screen.findByTestId("topology-canvas");
    await userEvent.click(screen.getByRole("button", { name: /vista de lista/i }));

    expect(screen.queryByTestId("topology-canvas")).not.toBeInTheDocument();
    const item = screen.getByRole("button", { name: /prod-api-01.*activo enfocado/i });
    await userEvent.click(item);

    const aside = await screen.findByRole("complementary");
    expect(within(aside).getByText("prod-api-01")).toBeInTheDocument();
  });

  it("shows a not-found empty state when the focused asset does not exist", async () => {
    mockSearchParams = new URLSearchParams("asset_id=missing");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: false,
      error: { kind: "not_found" },
    });

    renderWorkspace();
    expect(await screen.findByText("Activo no encontrado")).toBeInTheDocument();
    expect(
      screen.getByText("Puede que no exista, no tengas acceso a él o esté en la papelera."),
    ).toBeInTheDocument();
  });

  it("shows an inline error with retry when the subgraph fails to load", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    const getSubgraph = vi
      .spyOn(topologyService, "getSubgraph")
      .mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } })
      .mockResolvedValueOnce({ ok: true, data: subgraph() });

    renderWorkspace();
    expect(await screen.findByText("No se pudo cargar la topología.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(getSubgraph).toHaveBeenCalledTimes(2));
    await screen.findByTestId("topology-canvas");
  });
});
