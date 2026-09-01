import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetDetail } from "@/components/assets/AssetDetail";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";
import type { Asset } from "@/types/asset";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ASSET: Asset = {
  id: "abc-123",
  name: "billing-api",
  asset_type: "Application",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  hostname: "billing.internal",
  ip_address: "10.2.3.4",
  owner: "payments-team",
  description: "Handles invoicing.",
  is_active: true,
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
};

function renderDetail(asset: Asset, onChanged = vi.fn()) {
  render(
    <LanguageProvider>
      <AssetDetail asset={asset} onChanged={onChanged} />
    </LanguageProvider>,
  );
  return { onChanged };
}

afterEach(() => vi.restoreAllMocks());

describe("AssetDetail", () => {
  it("renders the header, overview and description", () => {
    renderDetail(ASSET);
    expect(screen.getByRole("heading", { name: "billing-api", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("billing.internal")).toBeInTheDocument();
    expect(screen.getByText("10.2.3.4")).toBeInTheDocument();
    expect(screen.getByText("payments-team")).toBeInTheDocument();
    expect(screen.getByText("Handles invoicing.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /editar/i })).toHaveAttribute(
      "href",
      "/assets/abc-123/edit",
    );
  });

  it("deactivates behind a confirm step and reports the new asset", async () => {
    const updated = { ...ASSET, is_active: false };
    const spy = vi
      .spyOn(assetService, "deactivateAsset")
      .mockResolvedValue({ ok: true, data: updated });
    const { onChanged } = renderDetail(ASSET);

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    expect(spy).not.toHaveBeenCalled(); // confirm required
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
    expect(spy).toHaveBeenCalledWith("abc-123");
  });

  it("shows the inactive notice and offers reactivate", async () => {
    const inactive = { ...ASSET, is_active: false };
    const spy = vi
      .spyOn(assetService, "reactivateAsset")
      .mockResolvedValue({ ok: true, data: ASSET });
    const { onChanged } = renderDetail(inactive);

    expect(screen.getByText(/este activo está inactivo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /reactivar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(ASSET));
    expect(spy).toHaveBeenCalledWith("abc-123");
  });

  it("surfaces an error when the lifecycle action fails", async () => {
    vi.spyOn(assetService, "deactivateAsset").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable" },
    });
    renderDetail(ASSET);
    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo completar la acción/i);
  });
});
