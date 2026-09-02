import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";
import * as incidentService from "@/services/incidents";

import InterceptedIncidentModal from "./@modal/(.)[id]/page";
import InterceptedIncidentCreate from "./@modal/(.)new/page";
import InterceptedIncidentEdit from "./@modal/(.)[id]/edit/page";

/**
 * Regression tests for the `/incidents/new` routing bug.
 *
 * Next.js 15.x resolves a client-side `/incidents/new` navigation through the
 * dynamic `(.)[id]` interceptor (with `id === "new"`) instead of `(.)new`. The
 * interceptor page must therefore dispatch on the segment: `"new"` -> the create
 * modal, anything else -> the detail workspace, so `IncidentDetailLoader` never
 * receives a non-id value and `GET /api/v1/incidents/new` is never issued.
 */

let params: Record<string, string> = {};
const back = vi.fn();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ back, replace, push }),
  usePathname: () => "/incidents/new",
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
  window.history.pushState({}, "", "/incidents/new");
  vi.spyOn(assetService, "listAssets").mockResolvedValue({
    ok: true,
    data: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  params = {};
});

describe("incidents @modal/(.)[id] interceptor", () => {
  it("renders the CREATE modal for the 'new' segment and never fetches an incident", async () => {
    params = { id: "new" };
    const getIncident = vi.spyOn(incidentService, "getIncident");

    renderWithProviders(<InterceptedIncidentModal />);

    const dialog = await screen.findByRole("dialog", { name: /nuevo incidente/i });
    expect(dialog.className).toMatch(/w-\[min\(900px/); // centered `modal` variant
    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear incidente/i })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(getIncident).not.toHaveBeenCalled();
    expect(screen.queryByText(/no se pudo cargar el incidente/i)).not.toBeInTheDocument();
  });

  it("renders the DETAIL workspace for a real id and fetches that incident", async () => {
    params = { id: "abc-123" };
    const getIncident = vi
      .spyOn(incidentService, "getIncident")
      .mockResolvedValue({ ok: false, error: { kind: "not_found" } });

    renderWithProviders(<InterceptedIncidentModal />);

    await waitFor(() => expect(getIncident).toHaveBeenCalledWith("abc-123"));
    expect(getIncident).not.toHaveBeenCalledWith("new");
  });
});

describe("incidents @modal/(.)new interceptor", () => {
  it("renders the CREATE modal and never fetches an incident", async () => {
    const getIncident = vi.spyOn(incidentService, "getIncident");
    renderWithProviders(<InterceptedIncidentCreate />);
    expect(await screen.findByRole("dialog", { name: /nuevo incidente/i })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(getIncident).not.toHaveBeenCalled();
  });
});

describe("incidents @modal/(.)[id]/edit interceptor", () => {
  it("renders the EDIT drawer for a real id", async () => {
    params = { id: "abc-123" };
    const getIncident = vi
      .spyOn(incidentService, "getIncident")
      .mockResolvedValue({ ok: false, error: { kind: "not_found" } });

    renderWithProviders(<InterceptedIncidentEdit />);

    await waitFor(() => expect(getIncident).toHaveBeenCalledWith("abc-123"));
    expect(await screen.findByRole("dialog", { name: /editar incidente/i })).toBeInTheDocument();
  });
});
