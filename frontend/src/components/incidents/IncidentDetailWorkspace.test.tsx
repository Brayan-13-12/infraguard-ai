import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IncidentDetailWorkspace } from "@/components/incidents/IncidentDetailWorkspace";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import { subscribeIncidentsChanged } from "@/lib/incidentsRefresh";
import * as assetService from "@/services/assets";
import * as incidentService from "@/services/incidents";
import type { IncidentDetail } from "@/types/incident";

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
  created_by: "user-9",
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
  affected_assets: [
    {
      id: "asset-1",
      name: "payments-db",
      asset_type: "Database",
      environment: "Production",
      criticality: "Critical",
      status: "Operational",
      is_active: true,
    },
  ],
  timeline: [
    {
      id: "e1",
      type: "CREATED",
      message: "Incidente creado",
      created_by: "user-9",
      actor_email: "sre@example.com",
      created_at: "2026-09-01T09:00:00Z",
    },
  ],
};

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <IncidentDetailWorkspace id="abc-123" />
      <Toaster />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  window.history.pushState({}, "", "/incidents/abc-123");
  vi.spyOn(incidentService, "getIncident").mockResolvedValue({ ok: true, data: DETAIL });
  vi.spyOn(assetService, "listAssets").mockResolvedValue({
    ok: true,
    data: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
});

describe("IncidentDetailWorkspace", () => {
  it("renders a large labelled workspace with the incident and its tabs", async () => {
    renderWorkspace();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Checkout latency spike");
    expect(dialog.className).toMatch(/w-\[min\(1100px/);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByText("p95 above 2s")).toBeInTheDocument();
  });

  it("shows affected assets, timeline and activity metadata across tabs", async () => {
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("tab", { name: /activos afectados/i }));
    expect(screen.getByText("payments-db")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /cronología|timeline/i }));
    expect(screen.getByText("Incidente creado")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /actividad/i }));
    expect(screen.getByText("user-9")).toBeInTheDocument();
  });

  it("edits the title inline and refreshes", async () => {
    const update = vi
      .spyOn(incidentService, "updateIncident")
      .mockResolvedValue({ ok: true, data: { ...DETAIL, title: "Checkout latency (sev2)" } });
    const listener = vi.fn();
    const unsub = subscribeIncidentsChanged(listener);
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /editar título/i }));
    const editor = await screen.findByRole("dialog", { name: /editar título/i });
    const input = within(editor).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Checkout latency (sev2)");
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("abc-123", { title: "Checkout latency (sev2)" }),
    );
    expect(await screen.findByText(/incidente actualizado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    unsub();
  });

  it("edits severity inline via a select dialog", async () => {
    const update = vi
      .spyOn(incidentService, "updateIncident")
      .mockResolvedValue({ ok: true, data: { ...DETAIL, severity: "Critical" } });
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /editar severidad/i }));
    const editor = await screen.findByRole("dialog", { name: /editar severidad/i });
    await userEvent.selectOptions(within(editor).getByRole("combobox"), "Critical");
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("abc-123", { severity: "Critical" }),
    );
  });

  it("routes an inline status change to Resolved through the lifecycle endpoint", async () => {
    const resolve = vi
      .spyOn(incidentService, "resolveIncident")
      .mockResolvedValue({ ok: true, data: { ...DETAIL, status: "Resolved" } });
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /editar estado/i }));
    const editor = await screen.findByRole("dialog", { name: /editar estado/i });
    await userEvent.selectOptions(within(editor).getByRole("combobox"), "Resolved");
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith("abc-123"));
    expect(await screen.findByText(/incidente resuelto/i)).toBeInTheDocument();
  });

  it("edits affected assets in a focused dialog and reconciles the relationship", async () => {
    vi.spyOn(assetService, "listAssets").mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "asset-2",
            name: "web-prod-01",
            asset_type: "Server",
            environment: "Production",
            criticality: "High",
            status: "Operational",
            hostname: null,
            ip_address: null,
            owner: null,
            description: null,
            is_active: true,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
        page: 1,
        page_size: 20,
        total: 1,
        total_pages: 1,
      },
    });
    const update = vi.spyOn(incidentService, "updateIncident").mockResolvedValue({
      ok: true,
      data: { ...DETAIL, affected_assets: [] },
    });
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("tab", { name: /activos afectados/i }));
    await userEvent.click(screen.getByRole("button", { name: /editar activos/i }));
    const editor = await screen.findByRole("dialog", { name: /editar activos afectados/i });

    // remove the seeded asset via its chip
    await userEvent.click(within(editor).getByRole("button", { name: /quitar payments-db/i }));
    await userEvent.click(within(editor).getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("abc-123", { asset_ids: [] }),
    );
    expect(await screen.findByText(/activos afectados actualizados/i)).toBeInTheDocument();
  });

  it("does not stack: Escape on the resolve confirm keeps the workspace open", async () => {
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /^resolver$/i }));
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(2));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBe(1));
    expect(back).not.toHaveBeenCalled();
  });

  it("resolves from the footer behind a confirm", async () => {
    const resolve = vi
      .spyOn(incidentService, "resolveIncident")
      .mockResolvedValue({ ok: true, data: { ...DETAIL, status: "Resolved" } });
    const listener = vi.fn();
    const unsub = subscribeIncidentsChanged(listener);
    renderWorkspace();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /^resolver$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith("abc-123"));
    expect(await screen.findByText(/incidente resuelto/i)).toBeInTheDocument();
    await waitFor(() => expect(listener).toHaveBeenCalled());
    unsub();
  });
});
