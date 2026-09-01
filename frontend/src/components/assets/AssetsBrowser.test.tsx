import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetsBrowser } from "@/components/assets/AssetsBrowser";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";
import type { Asset, AssetPage } from "@/types/asset";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/assets",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const asset = (over: Partial<Asset>): Asset => ({
  id: "a1",
  name: "web-01",
  asset_type: "Server",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  hostname: null,
  ip_address: null,
  owner: "sre",
  description: null,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const page = (items: Asset[], over: Partial<AssetPage> = {}): AssetPage => ({
  items,
  page: 1,
  page_size: 20,
  total: items.length,
  total_pages: 1,
  ...over,
});

function renderBrowser() {
  return render(
    <LanguageProvider>
      <AssetsBrowser />
    </LanguageProvider>,
  );
}

beforeEach(() => replace.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("AssetsBrowser", () => {
  it("shows a loading state then the asset list", async () => {
    vi.spyOn(assetService, "listAssets").mockResolvedValue({
      ok: true,
      data: page([asset({ name: "billing-db" })]),
    });
    renderBrowser();
    expect(screen.getByText(/cargando activos/i)).toBeInTheDocument();
    expect(await screen.findAllByRole("link", { name: "billing-db" })).not.toHaveLength(0);
  });

  it("renders the empty state with a create CTA when there are no assets", async () => {
    vi.spyOn(assetService, "listAssets").mockResolvedValue({ ok: true, data: page([]) });
    renderBrowser();
    expect(await screen.findByText(/aún no hay activos/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crear activo/i })).toHaveAttribute(
      "href",
      "/assets/new",
    );
  });

  it("renders an error state and retries on demand", async () => {
    const spy = vi
      .spyOn(assetService, "listAssets")
      .mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } })
      .mockResolvedValueOnce({ ok: true, data: page([asset({ name: "recovered" })]) });
    renderBrowser();

    expect(await screen.findByText(/no se pudieron cargar los activos/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(screen.getAllByRole("link", { name: "recovered" })).not.toHaveLength(0));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("searches (debounced) and passes the term to the service", async () => {
    const spy = vi
      .spyOn(assetService, "listAssets")
      .mockResolvedValue({ ok: true, data: page([asset({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "web-01" });

    await userEvent.type(screen.getByLabelText(/buscar activos/i), "billing");

    await waitFor(
      () =>
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ q: "billing", page: 1 })),
      { timeout: 2000 },
    );
  });

  it("filters by environment", async () => {
    const spy = vi
      .spyOn(assetService, "listAssets")
      .mockResolvedValue({ ok: true, data: page([asset({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "web-01" });

    await userEvent.selectOptions(screen.getByLabelText("Entorno"), "Staging");

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ environment: "Staging" })),
    );
  });

  it("paginates", async () => {
    const spy = vi.spyOn(assetService, "listAssets").mockResolvedValue({
      ok: true,
      data: page([asset({})], { total: 40, total_pages: 2, page: 1 }),
    });
    renderBrowser();
    await screen.findAllByRole("link", { name: "web-01" });

    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
    );
  });

  it("shows a translated result count", async () => {
    vi.spyOn(assetService, "listAssets").mockResolvedValue({
      ok: true,
      data: page([asset({})], { total: 7 }),
    });
    renderBrowser();
    expect(await screen.findByText("7 activos")).toBeInTheDocument();
  });
});
