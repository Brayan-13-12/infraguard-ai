import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetDependenciesTab } from "@/components/assets/relationships/AssetDependenciesTab";
import { LanguageProvider } from "@/i18n";
import * as relationshipsService from "@/services/relationships";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import type { Asset } from "@/types/asset";
import type { AssetRelationshipsGrouped, AssetSummary, RelationshipDetail } from "@/types/relationship";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ASSET: Asset = {
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

function summary(over: Partial<AssetSummary> = {}): AssetSummary {
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

function rel(over: Partial<RelationshipDetail> = {}): RelationshipDetail {
  return {
    id: "r1",
    source_asset_id: ASSET.id,
    target_asset_id: "a2",
    relationship_type: "depends_on",
    description: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    source: summary({ id: ASSET.id, name: ASSET.name }),
    target: summary(),
    ...over,
  };
}

function grouped(over: Partial<AssetRelationshipsGrouped> = {}): AssetRelationshipsGrouped {
  return {
    outgoing: [],
    incoming: [],
    counts: { outgoing: 0, incoming: 0, total: 0 },
    ...over,
  };
}

function renderTab(user = makeUser()) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <AssetDependenciesTab asset={ASSET} />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AssetDependenciesTab", () => {
  it("shows the empty state with an Add-relationship affordance for a manager", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped(),
    });
    renderTab();
    expect(await screen.findByText("No hay relaciones registradas para este activo.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /añadir relación/i }).length).toBeGreaterThan(0);
  });

  it("renders grouped outgoing and incoming relationships with the correct headings", async () => {
    const outgoing = rel({ id: "r-out", relationship_type: "depends_on" });
    const incoming = rel({
      id: "r-in",
      relationship_type: "uses",
      source: summary({ id: "a3", name: "prod-web-01" }),
      target: summary({ id: ASSET.id, name: ASSET.name }),
    });
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped({
        outgoing: [outgoing],
        incoming: [incoming],
        counts: { outgoing: 1, incoming: 1, total: 2 },
      }),
    });
    renderTab();
    expect(await screen.findByText("Depende de")).toBeInTheDocument();
    expect(screen.getByText("prod-db-primary")).toBeInTheDocument();
    expect(screen.getByText("Es utilizado por")).toBeInTheDocument();
    expect(screen.getByText("prod-web-01")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /prod-db-primary/i });
    expect(link).toHaveAttribute("href", "/assets/a2");
  });

  it("creates a relationship through the Add dialog", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships")
      .mockResolvedValueOnce({ ok: true, data: grouped() })
      .mockResolvedValueOnce({
        ok: true,
        data: grouped({
          outgoing: [rel()],
          counts: { outgoing: 1, incoming: 0, total: 1 },
        }),
      });
    const create = vi.spyOn(relationshipsService, "createRelationship").mockResolvedValue({
      ok: true,
      data: rel(),
    });
    const listAssets = await import("@/services/assets");
    vi.spyOn(listAssets, "listAssets").mockResolvedValue({
      ok: true,
      data: { items: [{ ...ASSET, id: "a2", name: "prod-db-primary" }], page: 1, page_size: 20, total: 1, total_pages: 1 },
    });

    renderTab();
    const addButtons = await screen.findAllByRole("button", { name: /añadir relación/i });
    await userEvent.click(addButtons[0]!);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByText("prod-db-primary"));
    await userEvent.click(within(dialog).getByRole("button", { name: /crear relación/i }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      source_asset_id: ASSET.id,
      target_asset_id: "a2",
      relationship_type: "depends_on",
      description: null,
    }));
    expect(await screen.findByText("Depende de")).toBeInTheDocument();
  });

  it("shows a duplicate error inline without closing the dialog", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped(),
    });
    vi.spyOn(relationshipsService, "createRelationship").mockResolvedValue({
      ok: false,
      error: { kind: "duplicate" },
    });
    const listAssets = await import("@/services/assets");
    vi.spyOn(listAssets, "listAssets").mockResolvedValue({
      ok: true,
      data: { items: [{ ...ASSET, id: "a2", name: "prod-db-primary" }], page: 1, page_size: 20, total: 1, total_pages: 1 },
    });

    renderTab();
    const addButtons = await screen.findAllByRole("button", { name: /añadir relación/i });
    await userEvent.click(addButtons[0]!);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByText("prod-db-primary"));
    await userEvent.click(within(dialog).getByRole("button", { name: /crear relación/i }));

    expect(
      await within(dialog).findByText("Ya existe una relación de este tipo entre estos activos."),
    ).toBeInTheDocument();
  });

  it("edits a relationship's type and description", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped({
        outgoing: [rel()],
        counts: { outgoing: 1, incoming: 0, total: 1 },
      }),
    });
    const update = vi.spyOn(relationshipsService, "updateRelationship").mockResolvedValue({
      ok: true,
      data: rel({ description: "actualizado" }),
    });

    renderTab();
    await screen.findByText("Depende de");
    await userEvent.click(screen.getByRole("button", { name: /^editar relación$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
  });

  it("deletes a relationship after confirmation", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships")
      .mockResolvedValueOnce({
        ok: true,
        data: grouped({ outgoing: [rel()], counts: { outgoing: 1, incoming: 0, total: 1 } }),
      })
      .mockResolvedValueOnce({ ok: true, data: grouped() });
    const del = vi.spyOn(relationshipsService, "deleteRelationship").mockResolvedValue({
      ok: true,
      data: null,
    });

    renderTab();
    await screen.findByText("Depende de");
    await userEvent.click(screen.getByRole("button", { name: /^eliminar relación$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^eliminar relación$/i }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("No hay relaciones registradas para este activo.")).toBeInTheDocument();
  });

  it("hides add/edit/delete affordances without relationships.manage", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped({
        outgoing: [rel()],
        counts: { outgoing: 1, incoming: 0, total: 1 },
      }),
    });
    renderTab(makeUser({ permissions: ["relationships.read", "assets.read"] }));
    await screen.findByText("Depende de");
    expect(screen.queryByRole("button", { name: /añadir relación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar relación$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^eliminar relación$/i })).not.toBeInTheDocument();
  });

  it("links to the topology workspace focused on this asset", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped(),
    });
    renderTab();
    await screen.findByText("No hay relaciones registradas para este activo.");
    const links = screen.getAllByRole("link", { name: /ver topología/i });
    expect(links[0]).toHaveAttribute("href", `/topology?asset_id=${ASSET.id}`);
  });

  it("links to the global Dependencias module filtered to this asset", async () => {
    vi.spyOn(relationshipsService, "getAssetRelationships").mockResolvedValue({
      ok: true,
      data: grouped(),
    });
    renderTab();
    await screen.findByText("No hay relaciones registradas para este activo.");
    const link = screen.getByRole("link", { name: /ver todas las dependencias/i });
    expect(link).toHaveAttribute("href", `/dependencies?asset_id=${ASSET.id}`);
  });
});
