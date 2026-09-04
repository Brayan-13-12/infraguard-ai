import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DependenciesBrowser } from "@/components/dependencies/DependenciesBrowser";
import { LanguageProvider } from "@/i18n";
import * as assetsService from "@/services/assets";
import * as relationshipsService from "@/services/relationships";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import type { Asset } from "@/types/asset";
import type { AssetSummary, RelationshipDetail, RelationshipSummary } from "@/types/relationship";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let mockSearchParams = new URLSearchParams("");
const replace = vi.fn((url: string) => {
  const i = url.indexOf("?");
  mockSearchParams = new URLSearchParams(i >= 0 ? url.slice(i + 1) : "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/dependencies",
  useSearchParams: () => mockSearchParams,
}));

function assetSummary(over: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: "a1",
    name: "prod-api-01",
    hostname: null,
    asset_type: "Application",
    environment: "Production",
    criticality: "Critical",
    status: "Operational",
    is_active: true,
    ...over,
  };
}

function rel(over: Partial<RelationshipDetail> = {}): RelationshipDetail {
  return {
    id: "r1",
    source_asset_id: "a1",
    target_asset_id: "a2",
    relationship_type: "depends_on",
    description: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    source: assetSummary(),
    target: assetSummary({ id: "a2", name: "prod-db-primary", asset_type: "Database" }),
    ...over,
  };
}

function page(items: RelationshipDetail[], over: Partial<{ total: number; total_pages: number }> = {}) {
  return {
    items,
    page: 1,
    page_size: 20,
    total: over.total ?? items.length,
    total_pages: over.total_pages ?? (items.length > 0 ? 1 : 0),
  };
}

function summary(over: Partial<RelationshipSummary> = {}): RelationshipSummary {
  return {
    total: 1,
    connected_assets: 2,
    relationship_types: 6,
    assets_without_relationships: 0,
    ...over,
  };
}

const FULL_ASSET_A: Asset = {
  id: "a1",
  name: "prod-api-01",
  asset_type: "Application",
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
};

const FULL_ASSET_B: Asset = {
  ...FULL_ASSET_A,
  id: "a2",
  name: "prod-db-primary",
  asset_type: "Database",
};

function renderBrowser(user = makeUser()) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <DependenciesBrowser />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  mockSearchParams = new URLSearchParams("");
  replace.mockClear();
});

describe("DependenciesBrowser", () => {
  it("renders the summary and a relationship row with source, target and relationship label", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    vi.spyOn(relationshipsService, "listRelationships").mockResolvedValue({
      ok: true,
      data: page([rel()]),
    });

    renderBrowser();

    expect(
      await screen.findByText("1 relaciones · 2 activos conectados · 6 tipos de relación"),
    ).toBeInTheDocument();
    expect(screen.getByText("prod-api-01")).toBeInTheDocument();
    expect(screen.getByText("prod-db-primary")).toBeInTheDocument();
    expect(screen.getByText("Depende de")).toBeInTheDocument();

    const sourceLink = screen.getByRole("link", { name: /ver origen: prod-api-01/i });
    expect(sourceLink).toHaveAttribute("href", "/assets/a1");
    const targetLink = screen.getByRole("link", { name: /ver destino: prod-db-primary/i });
    expect(targetLink).toHaveAttribute("href", "/assets/a2");
  });

  it("shows a link to the relationship's source in the topology workspace", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    vi.spyOn(relationshipsService, "listRelationships").mockResolvedValue({
      ok: true,
      data: page([rel()]),
    });
    renderBrowser();
    await screen.findByText("prod-api-01");
    const topologyLink = screen.getByRole("link", { name: /ver origen en topología/i });
    expect(topologyLink).toHaveAttribute("href", "/topology?asset_id=a1");
  });

  it("debounces search and re-fetches with the term", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    const list = vi
      .spyOn(relationshipsService, "listRelationships")
      .mockResolvedValue({ ok: true, data: page([rel()]) });

    renderBrowser();
    await screen.findByText("prod-api-01");
    await userEvent.type(screen.getByPlaceholderText(/buscar por activo o relación/i), "prod-db");

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "prod-db" })),
    );
  });

  it("filters by relationship type", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    const list = vi
      .spyOn(relationshipsService, "listRelationships")
      .mockResolvedValue({ ok: true, data: page([rel()]) });

    renderBrowser();
    await screen.findByText("prod-api-01");
    await userEvent.click(screen.getByRole("button", { name: /^filtros$/i }));
    const select = screen.getByRole("combobox", { name: /tipo de relación/i });
    await userEvent.selectOptions(select, "Depende de");

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ relationshipType: ["depends_on"] }),
      ),
    );
  });

  it("paginates with Next/Previous", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    const list = vi
      .spyOn(relationshipsService, "listRelationships")
      .mockResolvedValue({ ok: true, data: page([rel()], { total: 40, total_pages: 2 }) });

    renderBrowser();
    await screen.findByText("prod-api-01");
    await userEvent.click(screen.getByRole("button", { name: /^siguiente$/i }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("creates a relationship from the global dialog, excluding the chosen source from the target picker", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary({ total: 0, connected_assets: 0 }),
    });
    vi.spyOn(relationshipsService, "listRelationships")
      .mockResolvedValueOnce({ ok: true, data: page([]) })
      .mockResolvedValueOnce({ ok: true, data: page([rel()]) });
    const create = vi
      .spyOn(relationshipsService, "createRelationship")
      .mockResolvedValue({ ok: true, data: rel() });
    const listAssets = vi.spyOn(assetsService, "listAssets").mockResolvedValue({
      ok: true,
      data: { items: [FULL_ASSET_A, FULL_ASSET_B], page: 1, page_size: 20, total: 2, total_pages: 1 },
    });

    renderBrowser();
    await userEvent.click(await screen.findByRole("button", { name: /nueva relación/i }));
    const dialog = await screen.findByRole("dialog");

    // Both pickers list both assets before a choice is made - click the
    // source picker's (first) occurrence of prod-api-01.
    await userEvent.click(within(dialog).getAllByText("prod-api-01")[0]!);
    // Once chosen as source, the target picker excludes it - "prod-api-01"
    // now appears exactly once (only in the confirmed source chip).
    await waitFor(() => expect(within(dialog).getAllByText("prod-api-01")).toHaveLength(1));
    await waitFor(() => expect(listAssets).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByText("prod-db-primary"));
    await userEvent.click(within(dialog).getByRole("button", { name: /crear relación/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        source_asset_id: "a1",
        target_asset_id: "a2",
        relationship_type: "depends_on",
        description: null,
      }),
    );
    expect(await screen.findByText("prod-db-primary")).toBeInTheDocument();
  });

  it("shows a duplicate error inline without closing the create dialog", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary({ total: 0, connected_assets: 0 }),
    });
    vi.spyOn(relationshipsService, "listRelationships").mockResolvedValue({
      ok: true,
      data: page([]),
    });
    vi.spyOn(relationshipsService, "createRelationship").mockResolvedValue({
      ok: false,
      error: { kind: "duplicate" },
    });
    vi.spyOn(assetsService, "listAssets").mockResolvedValue({
      ok: true,
      data: { items: [FULL_ASSET_A, FULL_ASSET_B], page: 1, page_size: 20, total: 2, total_pages: 1 },
    });

    renderBrowser();
    await userEvent.click(await screen.findByRole("button", { name: /nueva relación/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getAllByText("prod-api-01")[0]!);
    await waitFor(() => expect(within(dialog).getAllByText("prod-api-01")).toHaveLength(1));
    await userEvent.click(within(dialog).getByText("prod-db-primary"));
    await userEvent.click(within(dialog).getByRole("button", { name: /crear relación/i }));

    expect(
      await within(dialog).findByText("Ya existe una relación de este tipo entre estos activos."),
    ).toBeInTheDocument();
  });

  it("edits a relationship from its row", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    vi.spyOn(relationshipsService, "listRelationships").mockResolvedValue({
      ok: true,
      data: page([rel()]),
    });
    const update = vi.spyOn(relationshipsService, "updateRelationship").mockResolvedValue({
      ok: true,
      data: rel({ description: "actualizado" }),
    });

    renderBrowser();
    await screen.findByText("prod-api-01");
    await userEvent.click(screen.getByRole("button", { name: /^editar relación$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
  });

  it("deletes a relationship after confirmation", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary")
      .mockResolvedValueOnce({ ok: true, data: summary() })
      .mockResolvedValueOnce({ ok: true, data: summary({ total: 0 }) });
    vi.spyOn(relationshipsService, "listRelationships")
      .mockResolvedValueOnce({ ok: true, data: page([rel()]) })
      .mockResolvedValueOnce({ ok: true, data: page([]) });
    const del = vi.spyOn(relationshipsService, "deleteRelationship").mockResolvedValue({
      ok: true,
      data: null,
    });

    renderBrowser();
    await screen.findByText("prod-api-01");
    await userEvent.click(screen.getByRole("button", { name: /^eliminar relación$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^eliminar relación$/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("No hay relaciones registradas.")).toBeInTheDocument();
  });

  it("hides create/edit/delete affordances for a relationships.read-only user", async () => {
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    vi.spyOn(relationshipsService, "listRelationships").mockResolvedValue({
      ok: true,
      data: page([rel()]),
    });

    renderBrowser(makeUser({ permissions: ["relationships.read", "assets.read"] }));
    await screen.findByText("prod-api-01");
    expect(screen.queryByRole("button", { name: /nueva relación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar relación$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^eliminar relación$/i })).not.toBeInTheDocument();
  });

  it("filters by asset_id from the URL and shows a clearable banner", async () => {
    mockSearchParams = new URLSearchParams("asset_id=a1");
    vi.spyOn(relationshipsService, "getRelationshipsSummary").mockResolvedValue({
      ok: true,
      data: summary(),
    });
    const list = vi
      .spyOn(relationshipsService, "listRelationships")
      .mockResolvedValue({ ok: true, data: page([rel()]) });
    vi.spyOn(assetsService, "getAsset").mockResolvedValue({ ok: true, data: FULL_ASSET_A });

    renderBrowser();

    expect(await screen.findByText("Mostrando las dependencias de prod-api-01")).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: "a1" })));

    await userEvent.click(screen.getByRole("button", { name: /ver todas/i }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: undefined })),
    );
    expect(screen.queryByText("Mostrando las dependencias de prod-api-01")).not.toBeInTheDocument();
  });
});
