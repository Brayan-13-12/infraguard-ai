import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetDetail } from "@/components/assets/AssetDetail";
import { Toaster, clearToasts } from "@/components/ui/toast";
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
      <Toaster />
    </LanguageProvider>,
  );
  return { onChanged };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
});

describe("AssetDetail (full page)", () => {
  it("renders the header, tabs and the summary fields; no separate Edit route link", () => {
    renderDetail(ASSET);
    expect(screen.getByRole("heading", { name: "billing-api", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByText("payments-team")).toBeInTheDocument();
    expect(screen.getByText("Handles invoicing.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("shows technical + activity data on their tabs", async () => {
    renderDetail(ASSET);
    await userEvent.click(screen.getByRole("tab", { name: /información técnica/i }));
    expect(screen.getByText("billing.internal")).toBeInTheDocument();
    expect(screen.getByText("10.2.3.4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /actividad/i }));
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });

  it("edits the criticality inline via a small select dialog", async () => {
    const update = vi
      .spyOn(assetService, "updateAsset")
      .mockResolvedValue({ ok: true, data: { ...ASSET, criticality: "Low" } });
    const { onChanged } = renderDetail(ASSET);

    await userEvent.click(screen.getByRole("button", { name: /editar criticidad/i }));
    const editor = await screen.findByRole("dialog", { name: /editar criticidad/i });
    await userEvent.selectOptions(within(editor).getByRole("combobox"), "Low");
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("abc-123", { criticality: "Low" }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...ASSET, criticality: "Low" }));
  });

  it("deactivates behind a confirm step and reports the new asset", async () => {
    const updated = { ...ASSET, is_active: false };
    const spy = vi
      .spyOn(assetService, "deactivateAsset")
      .mockResolvedValue({ ok: true, data: updated });
    const { onChanged } = renderDetail(ASSET);

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    expect(spy).not.toHaveBeenCalled();
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

  it("moves the asset to Trash behind a confirm step, then toasts and calls onDeleted", async () => {
    const del = vi.spyOn(assetService, "deleteAsset").mockResolvedValue({ ok: true, data: null });
    const onDeleted = vi.fn();
    render(
      <LanguageProvider>
        <AssetDetail asset={ASSET} onChanged={vi.fn()} onDeleted={onDeleted} />
        <Toaster />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /mover a papelera/i }));
    expect(del).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: /¿mover activo a la papelera\?/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /mover a papelera/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("abc-123"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await screen.findByText(/activo movido a la papelera/i)).toBeInTheDocument();
  });

  it("keeps the confirm dialog open and shows an error when the soft delete fails", async () => {
    vi.spyOn(assetService, "deleteAsset").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable" },
    });
    const onDeleted = vi.fn();
    render(
      <LanguageProvider>
        <AssetDetail asset={ASSET} onChanged={vi.fn()} onDeleted={onDeleted} />
        <Toaster />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /mover a papelera/i }));
    const dialog = await screen.findByRole("dialog", { name: /¿mover activo a la papelera\?/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /mover a papelera/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo mover el activo/i);
    expect(onDeleted).not.toHaveBeenCalled();
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
