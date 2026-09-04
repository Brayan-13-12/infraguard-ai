import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetDetailWorkspace } from "@/components/assets/AssetDetailWorkspace";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { subscribeAssetsChanged } from "@/lib/assetsRefresh";
import * as assetService from "@/services/assets";
import type { Asset } from "@/types/asset";

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ id: "abc-123" }),
}));
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

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <MockAuthProvider>
      <AssetDetailWorkspace id="abc-123" />
      <Toaster />
    </MockAuthProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  window.history.pushState({}, "", "/assets/abc-123");
  vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
});

describe("AssetDetailWorkspace", () => {
  it("renders a large labelled workspace dialog with the asset once loaded", async () => {
    renderWorkspace();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("billing-api");
    // sizing token for the workspace surface
    expect(dialog.className).toMatch(/w-\[min\(1100px/);
  });

  it("shows a skeleton while loading, not a blank panel", async () => {
    vi.spyOn(assetService, "getAsset").mockImplementation(() => new Promise(() => {}));
    renderWorkspace();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("billing.internal")).not.toBeInTheDocument();
    expect(dialog.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("closes on Escape via router.back()", async () => {
    renderWorkspace();
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(back).toHaveBeenCalled();
  });

  it("exposes internal tabs and shows all persisted fields across them", async () => {
    renderWorkspace();
    await screen.findByRole("dialog");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Resumen",
      "Información técnica",
      "Incidentes",
      "Dependencias",
      "Actividad",
    ]);
    // Resumen (default)
    expect(screen.getByText("payments-team")).toBeInTheDocument();
    expect(screen.getByText("Handles invoicing.")).toBeInTheDocument();

    // Información técnica
    await userEvent.click(screen.getByRole("tab", { name: /información técnica/i }));
    expect(screen.getByText("billing.internal")).toBeInTheDocument();
    expect(screen.getByText("10.2.3.4")).toBeInTheDocument();

    // Actividad — metadata + ID, and the old "coming soon" placeholder gone
    await userEvent.click(screen.getByRole("tab", { name: /actividad/i }));
    expect(screen.getByText("abc-123")).toBeInTheDocument();
    expect(screen.queryByText("Dependencias y topología")).not.toBeInTheDocument();
    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument();
  });

  it("edits a field inline: opens a small editor, PATCHes, toasts, refreshes list", async () => {
    const update = vi
      .spyOn(assetService, "updateAsset")
      .mockResolvedValue({ ok: true, data: { ...ASSET, owner: "sre-team" } });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /editar responsable/i }));
    const editor = await screen.findByRole("dialog", { name: /editar responsable/i });
    const input = within(editor).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "sre-team");
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("abc-123", { owner: "sre-team" }),
    );
    expect(await screen.findByText(/activo actualizado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    // editor closed, workspace still open
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /editar responsable/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "billing-api" })).toBeInTheDocument();
    unsub();
  });

  it("keeps the field editor open and shows the error when the PATCH fails", async () => {
    vi.spyOn(assetService, "updateAsset").mockResolvedValue({
      ok: false,
      error: { kind: "validation", fields: { ip_address: "must be a valid IPv4 or IPv6 address" } },
    });
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("tab", { name: /información técnica/i }));
    await userEvent.click(screen.getByRole("button", { name: /editar dirección ip/i }));
    const editor = await screen.findByRole("dialog", { name: /editar dirección ip/i });
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    expect(await within(editor).findByRole("alert")).toHaveTextContent(/valid ipv4/i);
    expect(screen.getByRole("dialog", { name: /editar dirección ip/i })).toBeInTheDocument();
  });

  it("does not stack: Escape on the deactivate confirm keeps the workspace open", async () => {
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(2));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(1));
    expect(back).not.toHaveBeenCalled();
  });

  it("moves the asset to Trash from the footer behind a confirm, then closes", async () => {
    const del = vi.spyOn(assetService, "deleteAsset").mockResolvedValue({ ok: true, data: null });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /mover a papelera/i }));
    expect(del).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("dialog", {
      name: /¿mover activo a la papelera\?/i,
    });
    await userEvent.click(within(confirm).getByRole("button", { name: /mover a papelera/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("abc-123"));
    expect(await screen.findByText(/activo movido a la papelera/i)).toBeInTheDocument();
    await waitFor(() => expect(back).toHaveBeenCalled());
    await waitFor(() => expect(listener).toHaveBeenCalled());
    unsub();
  });

  it("shows the 'in Trash' notice instead of the detail when the asset is trashed", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({
      ok: false,
      error: { kind: "in_trash" },
    });
    renderWorkspace();
    expect(await screen.findByText(/en la papelera/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver en trash/i })).toHaveAttribute("href", "/trash");
  });

  it("deactivates from the footer behind a confirm and toasts + notifies", async () => {
    vi.spyOn(assetService, "deactivateAsset").mockResolvedValue({
      ok: true,
      data: { ...ASSET, is_active: false },
    });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText(/activo desactivado/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    unsub();
  });
});
