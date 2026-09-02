import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/i18n";
import * as assetService from "@/services/assets";
import * as authService from "@/services/auth";
import * as healthService from "@/services/health";
import type { AssetSummary } from "@/types/asset";
import DashboardPage from "./page";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/dashboard",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const USER = {
  id: "user-1234",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

const SUMMARY: AssetSummary = {
  total: 12,
  active: 10,
  inactive: 2,
  by_criticality: { Critical: 3, High: 4, Medium: 3, Low: 2 },
  by_status: { Operational: 6, Degraded: 2, Maintenance: 1, Offline: 3 },
  by_environment: { Production: 7, Staging: 2, Development: 2, Test: 1 },
  by_type: { Server: 5, Database: 4, Application: 3 },
};

beforeEach(() => {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
  vi.spyOn(assetService, "getAssetSummary").mockResolvedValue({ ok: true, data: SUMMARY });
  vi.spyOn(assetService, "listAssets").mockResolvedValue({
    ok: true,
    data: { items: [], page: 1, page_size: 5, total: 0, total_pages: 0 },
  });
  vi.spyOn(healthService, "fetchBackendHealth").mockResolvedValue({
    ok: true,
    data: { status: "ready", service: "api", database: "healthy" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockReset();
  push.mockReset();
});

function renderDashboard() {
  // The `(app)` route group provides the shell/guard via its layout; mirror that
  // here so the dashboard page renders inside the authenticated shell.
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AuthenticatedShell>
            <DashboardPage />
          </AuthenticatedShell>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

describe("DashboardPage", () => {
  it("keeps an English heading and nav label with Spanish surrounding copy", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText(/hola de nuevo/i)).toBeInTheDocument();
  });

  it("renders KPI counts from the summary, each linking into the matching Assets filter", async () => {
    renderDashboard();

    const total = await screen.findByRole("link", { name: /activos totales/i });
    expect(total).toHaveAttribute("href", "/assets");
    expect(within(total).getByText("12")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /críticos/i })).toHaveAttribute(
      "href",
      "/assets?criticality=Critical",
    );
    expect(screen.getByRole("link", { name: /operativos/i })).toHaveAttribute(
      "href",
      "/assets?status=Operational",
    );
    expect(
      screen.getByRole("link", { name: /degradados \/ fuera de servicio/i }),
    ).toHaveAttribute("href", "/assets?status=Degraded&status=Offline");
    expect(screen.getByRole("link", { name: /inactivos/i })).toHaveAttribute(
      "href",
      "/assets?state=inactive",
    );
  });

  it("renders only the criticality chart - the other charts were removed", async () => {
    renderDashboard();
    await screen.findByRole("link", { name: /activos totales/i });
    expect(screen.getByText("Activos por criticidad")).toBeInTheDocument();
    expect(screen.queryByText("Estado operativo")).not.toBeInTheDocument();
    expect(screen.queryByText("Activos por entorno")).not.toBeInTheDocument();
    expect(screen.queryByText("Activos por tipo")).not.toBeInTheDocument();
  });

  function operationalCard(): HTMLElement {
    let node: HTMLElement | null = screen.getByText("Estado actual");
    while (node && within(node).queryByText("Fuera de servicio") === null) {
      node = node.parentElement;
    }
    if (!node) throw new Error("operational summary card not found");
    return node;
  }

  it("renders a concise operational summary (not a second chart) with real counts", async () => {
    renderDashboard();
    await screen.findByText("Estado actual");
    const card = operationalCard();
    // by_status from SUMMARY: Operational 6, Degraded 2, Offline 3, Maintenance 1
    expect(within(card).getByText("Operativo")).toBeInTheDocument();
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).getByText("Fuera de servicio")).toBeInTheDocument();
    // top environment / type insights
    expect(within(card).getByText(/entorno principal/i)).toBeInTheDocument();
    expect(within(card).getByText("Producción")).toBeInTheDocument();
    expect(within(card).getByText("Servidor")).toBeInTheDocument();
  });

  it("operational summary status rows link into the filtered Assets list", async () => {
    renderDashboard();
    await screen.findByText("Estado actual");
    const card = operationalCard();
    expect(within(card).getByRole("link", { name: /operativo/i })).toHaveAttribute(
      "href",
      "/assets?status=Operational",
    );
  });

  it("Actualizar triggers a real refetch of the summary, recent assets and health", async () => {
    renderDashboard();
    await screen.findByRole("link", { name: /activos totales/i });

    const summarySpy = vi.mocked(assetService.getAssetSummary);
    const listSpy = vi.mocked(assetService.listAssets);
    const healthSpy = vi.mocked(healthService.fetchBackendHealth);
    summarySpy.mockClear();
    listSpy.mockClear();
    healthSpy.mockClear();

    await userEvent.click(screen.getByRole("button", { name: /actualizar/i }));

    // A real refetch: each service is hit again after the click (exact counts
    // are timing-brittle - "hit again" is the contract).
    await waitFor(
      () => {
        expect(summarySpy).toHaveBeenCalled();
        expect(listSpy).toHaveBeenCalled();
        expect(healthSpy).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("shows a loading state on the refresh button while refetching", async () => {
    renderDashboard();
    await screen.findByRole("link", { name: /activos totales/i });

    let resolve!: (v: { ok: true; data: AssetSummary }) => void;
    vi.mocked(assetService.getAssetSummary).mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );

    const btn = screen.getByRole("button", { name: /actualizar/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());

    resolve({ ok: true, data: SUMMARY });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("recovers from a summary load error via retry", async () => {
    vi.spyOn(assetService, "getAssetSummary")
      .mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } })
      .mockResolvedValueOnce({ ok: true, data: SUMMARY });

    renderDashboard();
    expect(await screen.findByText(/no se pudo cargar el panel/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByRole("link", { name: /activos totales/i })).toBeInTheDocument();
  });

  it("shows a compact system-status cue driven by the real health endpoint", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("button", { name: /ver el estado del sistema/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/sistema operativo/i)).toBeInTheDocument(),
    );
  });

  it("lists recently updated assets from the list endpoint", async () => {
    vi.spyOn(assetService, "listAssets").mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "a1",
            name: "billing-db",
            asset_type: "Database",
            environment: "Production",
            criticality: "Critical",
            status: "Operational",
            hostname: null,
            ip_address: null,
            owner: null,
            description: null,
            is_active: true,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-02T00:00:00Z",
          },
        ],
        page: 1,
        page_size: 5,
        total: 1,
        total_pages: 1,
      },
    });

    renderDashboard();
    expect(await screen.findByText(/actualizados recientemente/i)).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("link", { name: "billing-db" }))[0],
    ).toHaveAttribute("href", "/assets/a1");
  });

  it("no longer shows the platform-modules or account panels", async () => {
    renderDashboard();
    await screen.findByRole("link", { name: /activos totales/i });
    expect(screen.queryByText("Módulos de la plataforma")).not.toBeInTheDocument();
    expect(screen.queryByText("Tu cuenta")).not.toBeInTheDocument();
  });

  it("signs out from the sidebar with an explicit confirm step", async () => {
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    renderDashboard();

    await screen.findByRole("link", { name: /activos totales/i });
    await userEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
