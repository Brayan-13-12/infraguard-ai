import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";

import InterceptedAssetModal from "./@modal/(.)[id]/page";
import InterceptedAssetCreate from "./@modal/(.)new/page";
import InterceptedAssetEdit from "./@modal/(.)[id]/edit/page";

/**
 * Regression tests for the `/assets/new` routing bug (equivalent to the fixed
 * Incidents bug).
 *
 * Next.js 15.x resolves a client-side `/assets/new` navigation through the
 * dynamic `(.)[id]` interceptor (with `id === "new"`) instead of `(.)new`. The
 * interceptor page must therefore dispatch on the segment: `"new"` -> the create
 * modal, anything else -> the detail workspace, so `AssetDetailLoader` never
 * receives a non-id value and `GET /api/v1/assets/new` is never issued.
 */

let params: Record<string, string> = {};
const back = vi.fn();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ back, replace, push }),
  usePathname: () => "/assets/new",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <LanguageProvider>
      {ui}
      <Toaster />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  window.history.pushState({}, "", "/assets/new");
});

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  params = {};
});

describe("assets @modal/(.)[id] interceptor", () => {
  it("renders the CREATE modal for the 'new' segment and never fetches an asset", async () => {
    params = { id: "new" };
    const getAsset = vi.spyOn(assetService, "getAsset");

    renderWithProviders(<InterceptedAssetModal />);

    const dialog = await screen.findByRole("dialog", { name: /nuevo activo/i });
    expect(dialog.className).toMatch(/w-\[min\(900px/); // centered `modal` variant
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear activo/i })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    // The bug: the detail loader would have called getAsset("new").
    expect(getAsset).not.toHaveBeenCalled();
    expect(screen.queryByText(/no se pudo cargar el activo/i)).not.toBeInTheDocument();
  });

  it("renders the DETAIL workspace for a real id and fetches that asset", async () => {
    params = { id: "abc-123" };
    const getAsset = vi
      .spyOn(assetService, "getAsset")
      .mockResolvedValue({ ok: false, error: { kind: "not_found" } });

    renderWithProviders(<InterceptedAssetModal />);

    await waitFor(() => expect(getAsset).toHaveBeenCalledWith("abc-123"));
    expect(getAsset).not.toHaveBeenCalledWith("new");
  });
});

describe("assets @modal/(.)new interceptor", () => {
  it("renders the CREATE modal and never fetches an asset", async () => {
    const getAsset = vi.spyOn(assetService, "getAsset");
    renderWithProviders(<InterceptedAssetCreate />);
    expect(await screen.findByRole("dialog", { name: /nuevo activo/i })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(getAsset).not.toHaveBeenCalled();
  });
});

describe("assets @modal/(.)[id]/edit interceptor", () => {
  it("renders the EDIT drawer for a real id", async () => {
    params = { id: "abc-123" };
    const getAsset = vi
      .spyOn(assetService, "getAsset")
      .mockResolvedValue({ ok: false, error: { kind: "not_found" } });

    renderWithProviders(<InterceptedAssetEdit />);

    await waitFor(() => expect(getAsset).toHaveBeenCalledWith("abc-123"));
    expect(await screen.findByRole("dialog", { name: /editar activo/i })).toBeInTheDocument();
  });
});
