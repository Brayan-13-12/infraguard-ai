import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function setTopologyViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width: 1280px") ? wide : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setTopologyViewport(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockSearchParams = new URLSearchParams("");
  replace.mockClear();
});

describe("TopologyWorkspace", () => {
  async function startCreation() {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: "prod-api-01" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear relación" }));
  }

  it("creates a canonical directed edge with fixed graph endpoints and stays in the graph", async () => {
    const create = vi.spyOn(relationshipsService, "createRelationship").mockResolvedValue({ ok: true, data: relationshipDetail({ id: "new-edge", relationship_type: "uses" }) });
    setTopologyViewport(false);
    await startCreation();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Origen: prod-api-01");
    await userEvent.click(screen.getByRole("button", { name: "prod-db-primary" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("prod-api-01")).toBeInTheDocument();
    expect(within(dialog).getByText("prod-db-primary")).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo de relación"), "uses");
    await userEvent.type(within(dialog).getByLabelText("Descripción (opcional)"), "  Graph relationship  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear relación" }));
    expect(create).toHaveBeenCalledWith({ source_asset_id: "a1", target_asset_id: "a2", relationship_type: "uses", description: "Graph relationship" });
    expect(await screen.findByRole("button", { name: "edge-new-edge" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects a self target and lets the user cancel without writing", async () => {
    const create = vi.spyOn(relationshipsService, "createRelationship");
    await startCreation();
    await userEvent.click(screen.getByRole("button", { name: "prod-api-01" }));
    expect(screen.getByText("El activo de origen y el de destino deben ser diferentes.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/Origen: prod-api-01/)).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "asset_trashed", "not_found", "forbidden"] as const)("keeps failed %s creation in the dialog without adding an edge", async (kind) => {
    vi.spyOn(relationshipsService, "createRelationship").mockResolvedValue({ ok: false, error: { kind, message: "Rejected" } });
    await startCreation();
    await userEvent.click(screen.getByRole("button", { name: "prod-db-primary" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Crear relación" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
    expect(within(screen.getByTestId("topology-canvas")).getAllByRole("button")).toHaveLength(3);
  });

  it("hides graph creation without relationship management permission", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();
    renderWorkspace(makeUser({ permissions: ["assets.read", "relationships.read"] }));
    await userEvent.click(await screen.findByRole("button", { name: "prod-api-01" }));
    expect(screen.queryByRole("button", { name: "Crear relación" })).not.toBeInTheDocument();
  });

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
    expect(within(aside).getByRole("link", { name: /preguntar a la ia/i })).toHaveAttribute(
      "href",
      "/ai?asset_id=a1",
    );
    expect(within(aside).getByRole("link", { name: /ver activo/i })).toHaveAttribute(
      "href",
      "/assets/a1",
    );
    expect(within(aside).getByRole("button", { name: /centrar/i })).toBeInTheDocument();
    expect(within(aside).getByRole("button", { name: /expandir vecinos/i })).toBeInTheDocument();
  });

  it("uses the responsive inspector drawer below the desktop content width", async () => {
    setTopologyViewport(false);
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();

    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByText("prod-api-01"));

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    const drawer = await screen.findByRole("dialog", { name: /detalles/i });
    expect(within(drawer).getByRole("link", { name: /preguntar a la ia/i })).toHaveAttribute(
      "href",
      "/ai?asset_id=a1",
    );
    expect(within(drawer).getByRole("link", { name: /ver activo/i })).toHaveAttribute(
      "href",
      "/assets/a1",
    );
    expect(within(drawer).getByRole("button", { name: /centrar/i })).toBeInTheDocument();
    expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: /cerrar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /detalles/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
  });

  it("keeps narrow filters accessible and functional without removing the graph", async () => {
    setTopologyViewport(false);
    mockSearchParams = new URLSearchParams("asset_id=a1");
    const getSubgraph = vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({
      ok: true,
      data: subgraph(),
    });

    renderWorkspace();
    await screen.findByTestId("topology-canvas");
    await userEvent.click(screen.getByRole("button", { name: /^filtros$/i }));

    const filters = await screen.findByRole("dialog", { name: /^filtros$/i });
    await userEvent.selectOptions(
      within(filters).getByRole("combobox", { name: /tipo de relación/i }),
      "Depende de",
    );

    await waitFor(() =>
      expect(getSubgraph).toHaveBeenLastCalledWith(
        expect.objectContaining({ relationshipType: ["depends_on"] }),
      ),
    );
    expect(await screen.findByTestId("topology-canvas")).toBeInTheDocument();

    await userEvent.click(within(filters).getByRole("button", { name: /cerrar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /^filtros$/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^filtros$/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("lets narrow filters take over the canvas instead of stacking over the inspector", async () => {
    setTopologyViewport(false);
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph() });
    mockImpactEmpty();

    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByText("prod-api-01"));
    await screen.findByRole("dialog", { name: /detalles/i });

    await userEvent.click(screen.getByRole("button", { name: /^filtros$/i }));

    expect(await screen.findByRole("dialog", { name: /^filtros$/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /detalles/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
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

  it("ignores an obsolete edge detail response after another edge is selected", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(topologyService, "getSubgraph").mockResolvedValue({ ok: true, data: subgraph({ edges: [edge(), edge({ id: "e2" })] }) });
    let finishFirst!: (value: Awaited<ReturnType<typeof relationshipsService.getAssetRelationships>>) => void;
    vi.spyOn(relationshipsService, "getAssetRelationships")
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, data: grouped({ outgoing: [relationshipDetail({ id: "e2", description: "Current edge" })] }) });
    renderWorkspace();
    const canvas = await screen.findByTestId("topology-canvas");
    await userEvent.click(within(canvas).getByRole("button", { name: "edge-e1" }));
    await userEvent.click(within(canvas).getByRole("button", { name: "edge-e2" }));
    expect(await screen.findByText("Current edge")).toBeInTheDocument();
    await act(async () => { finishFirst({ ok: true, data: grouped({ outgoing: [relationshipDetail({ description: "Obsolete edge" })] }) }); });
    expect(screen.queryByText("Obsolete edge")).not.toBeInTheDocument();
    expect(screen.getByText("Current edge")).toBeInTheDocument();
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
