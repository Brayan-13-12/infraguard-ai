import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetCreateDrawer } from "@/components/assets/AssetCreateDrawer";
import { AssetDetailDrawer } from "@/components/assets/AssetDetailDrawer";
import { AssetEditDrawer } from "@/components/assets/AssetEditDrawer";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import { subscribeAssetsChanged } from "@/lib/assetsRefresh";
import * as assetService from "@/services/assets";
import type { Asset } from "@/types/asset";

const back = vi.fn();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace, push }),
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

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <LanguageProvider>
      {ui}
      <Toaster />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  // Give history depth so the drawer close prefers router.back().
  window.history.pushState({}, "", "/assets/abc-123");
});

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  replace.mockReset();
  push.mockReset();
});

describe("AssetDetailDrawer", () => {
  it("renders a labelled modal dialog with the asset once loaded", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("billing-api");
    expect(await within(dialog).findByText("billing.internal")).toBeInTheDocument();
    expect(within(dialog).getByText("10.2.3.4")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /editar/i })).toHaveAttribute(
      "href",
      "/assets/abc-123/edit",
    );
  });

  it("shows a skeleton while loading, not a blank panel", async () => {
    vi.spyOn(assetService, "getAsset").mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    const dialog = await screen.findByRole("dialog");
    // No detail content, but the dialog chrome is present.
    expect(within(dialog).queryByText("billing.internal")).not.toBeInTheDocument();
    expect(dialog.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("closes with the close button via router.back()", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(back).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    expect(back).toHaveBeenCalled();
  });

  it("shows a not-found state for a missing asset", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({
      ok: false,
      error: { kind: "not_found" },
    });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    expect(await screen.findByText(/activo no encontrado/i)).toBeInTheDocument();
  });

  it("recovers from a load error via retry", async () => {
    const spy = vi
      .spyOn(assetService, "getAsset")
      .mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } })
      .mockResolvedValueOnce({ ok: true, data: ASSET });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);

    await userEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("billing.internal")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not stack: Escape on the deactivate confirm keeps the drawer open", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    // Two dialogs now: the drawer + the confirm.
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(2));

    await userEvent.keyboard("{Escape}");

    // The confirm closed; the drawer is still there and Back was NOT called.
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(1));
    expect(back).not.toHaveBeenCalled();
  });

  it("deactivates behind a confirm and toasts + notifies the list", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    vi.spyOn(assetService, "deactivateAsset").mockResolvedValue({
      ok: true,
      data: { ...ASSET, is_active: false },
    });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWithProviders(<AssetDetailDrawer id="abc-123" />);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText(/activo desactivado/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    unsub();
  });
});

describe("AssetCreateDrawer", () => {
  it("opens the create form and submits successfully without leaving Assets", async () => {
    const created = { ...ASSET, id: "new-1", name: "new-svc" };
    vi.spyOn(assetService, "createAsset").mockResolvedValue({ ok: true, data: created });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWithProviders(<AssetCreateDrawer />);

    const dialog = await screen.findByRole("dialog", { name: /nuevo activo/i });
    await userEvent.type(within(dialog).getByLabelText("Nombre"), "new-svc");
    await userEvent.click(within(dialog).getByRole("button", { name: /crear activo/i }));

    expect(await screen.findByText(/activo creado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalledWith({ focusId: "new-1" }));
    expect(back).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    unsub();
  });

  it("cancels via router.back()", async () => {
    renderWithProviders(<AssetCreateDrawer />);
    const dialog = await screen.findByRole("dialog", { name: /nuevo activo/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /cancelar/i }));
    expect(back).toHaveBeenCalled();
  });
});

describe("AssetEditDrawer", () => {
  it("prefills the form and returns after a successful save", async () => {
    vi.spyOn(assetService, "getAsset").mockResolvedValue({ ok: true, data: ASSET });
    vi.spyOn(assetService, "updateAsset").mockResolvedValue({
      ok: true,
      data: { ...ASSET, status: "Degraded" },
    });
    renderWithProviders(<AssetEditDrawer id="abc-123" />);

    const dialog = await screen.findByRole("dialog", { name: /editar activo/i });
    expect(await within(dialog).findByDisplayValue("billing-api")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByText(/activo actualizado correctamente/i)).toBeInTheDocument();
    expect(back).toHaveBeenCalled();
  });
});
