import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrashBrowser } from "@/components/trash/TrashBrowser";
import { LanguageProvider } from "@/i18n";
import * as trashService from "@/services/trash";
import type { TrashAssetPage, TrashIncidentPage, TrashSummary } from "@/types/trash";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/trash",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const SUMMARY: TrashSummary = { assets: 3, incidents: 2 };

const assetPage = (over: Partial<TrashAssetPage> = {}): TrashAssetPage => ({
  items: [
    {
      id: "a1",
      name: "payments-db",
      asset_type: "Database",
      environment: "Production",
      criticality: "Critical",
      status: "Operational",
      deleted_at: "2026-09-02T12:00:00Z",
      deleted_by: "u1",
      deleted_by_email: "ops@example.com",
    },
  ],
  page: 1,
  page_size: 20,
  total: 1,
  total_pages: 1,
  ...over,
});

const incidentPage = (over: Partial<TrashIncidentPage> = {}): TrashIncidentPage => ({
  items: [
    {
      id: "i1",
      title: "checkout latency",
      severity: "High",
      status: "Open",
      priority: "P2",
      owner: null,
      affected_asset_count: 1,
      deleted_at: "2026-09-02T12:00:00Z",
      deleted_by: null,
      deleted_by_email: null,
    },
  ],
  page: 1,
  page_size: 15,
  total: 1,
  total_pages: 1,
  ...over,
});

function renderBrowser() {
  return render(
    <LanguageProvider>
      <TrashBrowser />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  mockSearchParams = new URLSearchParams("");
  vi.spyOn(trashService, "getTrashSummary").mockResolvedValue({ ok: true, data: SUMMARY });
  vi.spyOn(trashService, "listTrashAssets").mockResolvedValue({ ok: true, data: assetPage() });
  vi.spyOn(trashService, "listTrashIncidents").mockResolvedValue({
    ok: true,
    data: incidentPage(),
  });
});

afterEach(() => vi.restoreAllMocks());

describe("TrashBrowser", () => {
  it("shows the English header, Spanish subtitle and tab counts from the summary", async () => {
    renderBrowser();
    expect(screen.getByRole("heading", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByText(/elementos eliminados que pueden restaurarse/i)).toBeInTheDocument();
    const assetsTab = await screen.findByRole("tab", { name: /assets/i });
    expect(assetsTab).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /incidents/i })).toHaveTextContent("2");
  });

  it("lists trashed assets by default with a deleter and no Edit action", async () => {
    renderBrowser();
    expect((await screen.findAllByText("payments-db")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ops@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("switches to the incidents tab and loads incidents", async () => {
    renderBrowser();
    await screen.findAllByText("payments-db");
    await userEvent.click(screen.getByRole("tab", { name: /incidents/i }));
    expect((await screen.findAllByText("checkout latency")).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("type=incidents"),
        expect.anything(),
      ),
    );
  });

  it("hydrates the tab and filters from the URL", async () => {
    mockSearchParams = new URLSearchParams("type=incidents&severity=High");
    renderBrowser();
    await waitFor(() =>
      expect(trashService.listTrashIncidents).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "High" }),
      ),
    );
    expect((await screen.findAllByText("checkout latency")).length).toBeGreaterThan(0);
  });

  it("debounces the search into the query and the URL", async () => {
    renderBrowser();
    await screen.findAllByText("payments-db");
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre/i), "pay");
    await waitFor(
      () =>
        expect(trashService.listTrashAssets).toHaveBeenCalledWith(
          expect.objectContaining({ q: "pay", page: 1 }),
        ),
      { timeout: 2000 },
    );
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringContaining("q=pay"),
      expect.anything(),
    );
  });

  it("shows the plain empty state when the trash is empty", async () => {
    vi.spyOn(trashService, "listTrashAssets").mockResolvedValue({
      ok: true,
      data: assetPage({ items: [], total: 0 }),
    });
    renderBrowser();
    expect(await screen.findByText("No hay activos en la papelera.")).toBeInTheDocument();
  });

  it("shows an error with a retry that refetches", async () => {
    const list = vi
      .spyOn(trashService, "listTrashAssets")
      .mockResolvedValue({ ok: false, error: { kind: "unexpected" } });
    renderBrowser();
    expect(await screen.findByText("No se pudo cargar la papelera")).toBeInTheDocument();

    list.mockResolvedValue({ ok: true, data: assetPage() });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect((await screen.findAllByText("payments-db")).length).toBeGreaterThan(0);
  });

  it("renders a loading skeleton before the first response resolves", async () => {
    let resolve: (v: { ok: true; data: TrashAssetPage }) => void = () => {};
    vi.spyOn(trashService, "listTrashAssets").mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { container } = renderBrowser();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    resolve({ ok: true, data: assetPage() });
    expect((await screen.findAllByText("payments-db")).length).toBeGreaterThan(0);
  });
});
