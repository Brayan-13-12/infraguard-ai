import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetCreateWorkspace } from "@/components/assets/AssetCreateWorkspace";
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
  window.history.pushState({}, "", "/assets/abc-123");
});

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  replace.mockReset();
  push.mockReset();
});

describe("AssetCreateWorkspace (centered create modal)", () => {
  it("opens as a labelled centered modal dialog and submits without leaving Assets", async () => {
    const created = { ...ASSET, id: "new-1", name: "new-svc" };
    vi.spyOn(assetService, "createAsset").mockResolvedValue({ ok: true, data: created });
    const listener = vi.fn();
    const unsub = subscribeAssetsChanged(listener);
    renderWithProviders(<AssetCreateWorkspace />);

    const dialog = await screen.findByRole("dialog", { name: /nuevo activo/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // `modal` overlay variant - centered, ~900px, not the detail workspace size
    expect(dialog.className).toMatch(/w-\[min\(900px/);

    await userEvent.type(within(dialog).getByLabelText("Nombre"), "new-svc");
    await userEvent.click(within(dialog).getByRole("button", { name: /crear activo/i }));

    expect(await screen.findByText(/activo creado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalledWith({ focusId: "new-1" }));
    expect(back).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    unsub();
  });

  it("cancels via router.back()", async () => {
    renderWithProviders(<AssetCreateWorkspace />);
    const dialog = await screen.findByRole("dialog", { name: /nuevo activo/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /cancelar/i }));
    expect(back).toHaveBeenCalled();
  });

  it("closes on Escape via router.back()", async () => {
    renderWithProviders(<AssetCreateWorkspace />);
    await screen.findByRole("dialog", { name: /nuevo activo/i });
    await userEvent.keyboard("{Escape}");
    expect(back).toHaveBeenCalled();
  });
});

describe("AssetEditDrawer (legacy deep-link edit route)", () => {
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
