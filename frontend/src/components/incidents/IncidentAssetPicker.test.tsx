import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IncidentAssetPicker } from "@/components/incidents/IncidentAssetPicker";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";
import type { Asset, AssetPage } from "@/types/asset";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const asset = (over: Partial<Asset>): Asset => ({
  id: "a1",
  name: "payments-db",
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

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return <IncidentAssetPicker value={value} onChange={setValue} />;
}

function renderPicker(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => {
  vi.spyOn(assetService, "listAssets").mockResolvedValue({
    ok: true,
    data: page([asset({ id: "a1", name: "payments-db" }), asset({ id: "a2", name: "web-prod-01" })]),
  });
});
afterEach(() => vi.restoreAllMocks());

describe("IncidentAssetPicker", () => {
  it("opens with a batch of PAGE_SIZE (20) assets, not the whole inventory", async () => {
    const spy = vi.spyOn(assetService, "listAssets");
    renderPicker(<Harness />);
    await screen.findByText("payments-db");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, q: "" }));
  });

  it("searches the inventory (debounced) server-side", async () => {
    const spy = vi.spyOn(assetService, "listAssets");
    renderPicker(<Harness />);
    await screen.findByText("payments-db");

    await userEvent.type(screen.getByLabelText(/buscar activos para relacionar/i), "pay");

    await waitFor(
      () =>
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({ q: "pay", page: 1, pageSize: 20 }),
        ),
      { timeout: 2000 },
    );
  });

  it("loads more incrementally with 'Mostrar más' and keeps prior results", async () => {
    const spy = vi
      .spyOn(assetService, "listAssets")
      .mockResolvedValueOnce({
        ok: true,
        data: page([asset({ id: "a1", name: "payments-db" })], { total: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: page([asset({ id: "a2", name: "web-prod-01" })], { page: 2, total: 2 }),
      });
    renderPicker(<Harness />);
    await screen.findByText("payments-db");

    await userEvent.click(screen.getByRole("button", { name: /mostrar más/i }));

    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 })),
    );
    expect(screen.getByText("payments-db")).toBeInTheDocument();
    expect(await screen.findByText("web-prod-01")).toBeInTheDocument();
  });

  it("toggles a result and reports the id via onChange, preventing duplicates", async () => {
    const onChange = vi.fn();
    renderPicker(
      <LanguageProvider>
        <IncidentAssetPicker value={["a1"]} onChange={onChange} />
      </LanguageProvider>,
    );

    const row = await screen.findByRole("button", { name: /^payments-db/i });
    expect(row).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(row); // already selected -> removes
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("keeps selected assets visible as removable chips when the search changes", async () => {
    const onChange = vi.fn();
    renderPicker(
      <LanguageProvider>
        <IncidentAssetPicker
          value={["a1"]}
          onChange={onChange}
          seed={[
            {
              id: "a1",
              name: "payments-db",
              asset_type: "Database",
              environment: "Production",
              criticality: "Critical",
            },
          ]}
        />
      </LanguageProvider>,
    );

    await userEvent.type(screen.getByLabelText(/buscar activos para relacionar/i), "zzz");
    const remove = await screen.findByRole("button", { name: /quitar payments-db/i });
    await userEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
