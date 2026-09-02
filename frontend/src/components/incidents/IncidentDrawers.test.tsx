import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IncidentCreateWorkspace } from "@/components/incidents/IncidentCreateWorkspace";
import { IncidentEditDrawer } from "@/components/incidents/IncidentEditDrawer";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import { subscribeIncidentsChanged } from "@/lib/incidentsRefresh";
import * as assetService from "@/services/assets";
import * as incidentService from "@/services/incidents";
import type { IncidentDetail } from "@/types/incident";

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push }),
  useParams: () => ({ id: "abc-123" }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const DETAIL: IncidentDetail = {
  id: "abc-123",
  title: "Checkout latency spike",
  description: "p95 above 2s",
  severity: "High",
  status: "Investigating",
  priority: "P2",
  owner: "sre-oncall",
  started_at: "2026-09-01T09:00:00Z",
  detected_at: null,
  resolved_at: null,
  created_by: "u1",
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
  affected_assets: [],
  timeline: [
    {
      id: "e1",
      type: "CREATED",
      message: "Incidente creado",
      created_by: "u1",
      actor_email: "sre@example.com",
      created_at: "2026-09-01T09:00:00Z",
    },
  ],
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
  window.history.pushState({}, "", "/incidents/abc-123");
  vi.spyOn(assetService, "listAssets").mockResolvedValue({
    ok: true,
    data: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 },
  });
});
// (asset picker page_size is 20 by design - see IncidentAssetPicker; unrelated to
// the incidents *list* default of 15.)

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  push.mockReset();
});

describe("IncidentCreateWorkspace (centered create modal)", () => {
  it("submits a new incident from a centered modal without leaving Incidents", async () => {
    const created = { ...DETAIL, id: "new-1", title: "new outage" };
    vi.spyOn(incidentService, "createIncident").mockResolvedValue({ ok: true, data: created });
    const listener = vi.fn();
    const unsub = subscribeIncidentsChanged(listener);
    renderWithProviders(<IncidentCreateWorkspace />);

    const dialog = await screen.findByRole("dialog", { name: /nuevo incidente/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.className).toMatch(/w-\[min\(900px/);
    await userEvent.type(within(dialog).getByLabelText("Título"), "new outage");
    await userEvent.selectOptions(within(dialog).getByLabelText("Severidad"), "Critical");
    await userEvent.selectOptions(within(dialog).getByLabelText("Prioridad"), "P1");
    await userEvent.click(within(dialog).getByRole("button", { name: /crear incidente/i }));

    expect(await screen.findByText(/incidente creado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalledWith({ focusId: "new-1" }));
    expect(back).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    unsub();
  });

  it("blocks submit until severity and priority are chosen", async () => {
    const spy = vi.spyOn(incidentService, "createIncident");
    renderWithProviders(<IncidentCreateWorkspace />);
    const dialog = await screen.findByRole("dialog", { name: /nuevo incidente/i });

    await userEvent.type(within(dialog).getByLabelText("Título"), "no severity");
    await userEvent.click(within(dialog).getByRole("button", { name: /crear incidente/i }));

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("IncidentEditDrawer (legacy deep-link edit route)", () => {
  it("prefills the form and returns after a successful save", async () => {
    vi.spyOn(incidentService, "getIncident").mockResolvedValue({ ok: true, data: DETAIL });
    vi.spyOn(incidentService, "updateIncident").mockResolvedValue({
      ok: true,
      data: { ...DETAIL, status: "Monitoring" },
    });
    renderWithProviders(<IncidentEditDrawer id="abc-123" />);

    const dialog = await screen.findByRole("dialog", { name: /editar incidente/i });
    expect(await within(dialog).findByDisplayValue("Checkout latency spike")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByText(/incidente actualizado correctamente/i)).toBeInTheDocument();
    expect(back).toHaveBeenCalled();
  });
});
