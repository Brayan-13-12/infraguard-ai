import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IncidentsBrowser } from "@/components/incidents/IncidentsBrowser";
import { LanguageProvider } from "@/i18n";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import * as assetService from "@/services/assets";
import * as incidentService from "@/services/incidents";
import type { Incident, IncidentPage, IncidentSummary } from "@/types/incident";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/incidents",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const incident = (over: Partial<Incident>): Incident => ({
  id: "i1",
  title: "Checkout latency spike",
  severity: "High",
  status: "Open",
  priority: "P2",
  owner: "sre",
  started_at: "2026-09-01T00:00:00Z",
  detected_at: null,
  resolved_at: null,
  affected_asset_count: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const page = (items: Incident[], over: Partial<IncidentPage> = {}): IncidentPage => ({
  items,
  page: 1,
  page_size: 20,
  total: items.length,
  total_pages: 1,
  ...over,
});

const SUMMARY: IncidentSummary = {
  total: 3,
  open: 2,
  critical_open: 1,
  investigating: 1,
  monitoring: 0,
  resolved_recently: 1,
  by_severity: { Critical: 1, High: 1, Medium: 1, Low: 0 },
  by_status: { Open: 1, Investigating: 1, Identified: 0, Monitoring: 0, Resolved: 1, Closed: 0 },
};

function renderBrowser() {
  return render(
    <LanguageProvider>
      <IncidentsBrowser />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  mockSearchParams = new URLSearchParams("");
  vi.spyOn(incidentService, "getIncidentSummary").mockResolvedValue({ ok: true, data: SUMMARY });
  vi.spyOn(assetService, "getAsset").mockResolvedValue({
    ok: false,
    error: { kind: "not_found" },
  });
});
afterEach(() => vi.restoreAllMocks());

describe("IncidentsBrowser", () => {
  it("shows a loading state then the incident list", async () => {
    vi.spyOn(incidentService, "listIncidents").mockResolvedValue({
      ok: true,
      data: page([incident({ title: "billing pipeline stalled" })]),
    });
    renderBrowser();
    expect(screen.getByText(/cargando incidentes/i)).toBeInTheDocument();
    expect(
      await screen.findAllByRole("link", { name: "billing pipeline stalled" }),
    ).not.toHaveLength(0);
  });

  it("requests exactly 15 rows per page (server-side pagination)", async () => {
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValue({ ok: true, data: page([incident({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 15, page: 1 }));
  });

  it("renders the empty state with a create CTA when there are no incidents", async () => {
    vi.spyOn(incidentService, "listIncidents").mockResolvedValue({ ok: true, data: page([]) });
    renderBrowser();
    expect(await screen.findByText(/no hay incidentes registrados/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crear incidente/i })).toHaveAttribute(
      "href",
      "/incidents/new",
    );
  });

  it("points the 'Nuevo incidente' CTA at the static /incidents/new route", async () => {
    vi.spyOn(incidentService, "listIncidents").mockResolvedValue({
      ok: true,
      data: page([incident({})]),
    });
    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });
    const ctas = screen.getAllByRole("link", { name: /nuevo incidente/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/incidents/new");
  });

  it("renders an error state and retries on demand", async () => {
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } })
      .mockResolvedValueOnce({ ok: true, data: page([incident({ title: "recovered" })]) });
    renderBrowser();

    expect(await screen.findByText(/no se pudieron cargar los incidentes/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "recovered" })).not.toHaveLength(0),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("searches (debounced) and passes the term to the service", async () => {
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValue({ ok: true, data: page([incident({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });

    await userEvent.type(screen.getByLabelText(/buscar incidentes/i), "billing");

    await waitFor(
      () => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ q: "billing", page: 1 })),
      { timeout: 2000 },
    );
  });

  it("filters by severity via the select", async () => {
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValue({ ok: true, data: page([incident({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });

    await userEvent.selectOptions(screen.getByLabelText("Severidad"), "Critical");

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: ["Critical"] })),
    );
  });

  it("applies a KPI filter when a stat is clicked", async () => {
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValue({ ok: true, data: page([incident({})]) });
    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });

    await userEvent.click(await screen.findByRole("button", { name: /investigando/i }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: ["Investigating"] })),
    );
  });

  it("refetches when notifyIncidentsChanged fires, keeping the active filter", async () => {
    mockSearchParams = new URLSearchParams("severity=Critical&page=2");
    const spy = vi
      .spyOn(incidentService, "listIncidents")
      .mockResolvedValue({ ok: true, data: page([incident({})], { total: 5, page: 2 }) });

    renderBrowser();
    await screen.findAllByRole("link", { name: "Checkout latency spike" });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ severity: ["Critical"], page: 2 }),
      ),
    );

    const before = spy.mock.calls.length;
    notifyIncidentsChanged();

    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: ["Critical"], page: 2 }),
    );
  });

  it("removes a single filter chip and keeps the rest", async () => {
    mockSearchParams = new URLSearchParams("severity=Critical&status=Open");
    vi.spyOn(incidentService, "listIncidents").mockResolvedValue({
      ok: true,
      data: page([incident({})]),
    });

    renderBrowser();
    await screen.findByRole("button", { name: /quitar filtro: severidad: crítica/i });

    await userEvent.click(
      screen.getByRole("button", { name: /quitar filtro: severidad: crítica/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /quitar filtro: severidad: crítica/i }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /quitar filtro: estado: abierto/i }),
    ).toBeInTheDocument();
  });
});
