import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as trashService from "@/services/trash";
import type { TrashAssetDetail, TrashIncidentDetail } from "@/types/trash";

import InterceptedTrashAsset from "./@modal/(.)assets/[id]/page";
import InterceptedTrashIncident from "./@modal/(.)incidents/[id]/page";

let params: Record<string, string> = {};
const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ back, replace: vi.fn(), push }),
  usePathname: () => "/trash",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ASSET_DETAIL: TrashAssetDetail = {
  id: "a1",
  name: "payments-db",
  asset_type: "Database",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  hostname: "db.internal",
  ip_address: "10.0.0.9",
  owner: "payments-team",
  description: "primary ledger",
  is_active: true,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-09-01T09:00:00Z",
  deleted_at: "2026-09-02T12:00:00Z",
  deleted_by: "u1",
  deleted_by_email: "ops@example.com",
};

const INCIDENT_DETAIL: TrashIncidentDetail = {
  id: "i1",
  title: "checkout latency",
  description: "p95 spike",
  severity: "High",
  status: "Open",
  priority: "P2",
  owner: null,
  started_at: "2026-09-01T09:00:00Z",
  detected_at: null,
  resolved_at: null,
  created_by: "u9",
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
  deleted_at: "2026-09-02T12:00:00Z",
  deleted_by: null,
  deleted_by_email: null,
  affected_assets: [
    {
      id: "a1",
      name: "payments-db",
      asset_type: "Database",
      environment: "Production",
      criticality: "Critical",
      status: "Operational",
      is_active: true,
      deleted_at: null,
    },
  ],
  timeline: [
    {
      id: "e1",
      type: "CREATED",
      message: "Incidente creado",
      created_by: "u9",
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
  window.history.pushState({}, "", "/trash/assets/a1");
});
afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
  back.mockReset();
  push.mockReset();
  params = {};
});

describe("trash @modal/(.)assets/[id] interceptor", () => {
  it("fetches the trashed asset by id and renders a read-only workspace", async () => {
    params = { id: "a1" };
    const getAsset = vi
      .spyOn(trashService, "getTrashAsset")
      .mockResolvedValue({ ok: true, data: ASSET_DETAIL });

    renderWithProviders(<InterceptedTrashAsset />);

    await waitFor(() => expect(getAsset).toHaveBeenCalledWith("a1"));
    const dialog = await screen.findByRole("dialog", { name: "payments-db" });
    // read-only: the restore notice is shown and there is no Edit control
    expect(within(dialog).getByText(/restáuralo para poder editarlo/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText("ops@example.com")).toBeInTheDocument();
  });

  it("restores the asset from the workspace footer behind a confirm, then closes", async () => {
    params = { id: "a1" };
    vi.spyOn(trashService, "getTrashAsset").mockResolvedValue({ ok: true, data: ASSET_DETAIL });
    const restore = vi
      .spyOn(trashService, "restoreTrashAsset")
      .mockResolvedValue({ ok: true, data: null });

    renderWithProviders(<InterceptedTrashAsset />);
    await screen.findByRole("dialog", { name: "payments-db" });

    await userEvent.click(screen.getByRole("button", { name: /restaurar/i }));
    const confirm = await screen.findByRole("dialog", { name: /¿restaurar activo\?/i });
    await userEvent.click(within(confirm).getByRole("button", { name: /^restaurar$/i }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText(/activo restaurado correctamente/i)).toBeInTheDocument();
    await waitFor(() => expect(back).toHaveBeenCalled());
  });

  it("shows a not-found state when the record is no longer in Trash", async () => {
    params = { id: "gone" };
    vi.spyOn(trashService, "getTrashAsset").mockResolvedValue({
      ok: false,
      error: { kind: "not_found" },
    });
    renderWithProviders(<InterceptedTrashAsset />);
    expect(
      await screen.findByText(/elemento no encontrado en la papelera/i),
    ).toBeInTheDocument();
  });
});

describe("trash @modal/(.)incidents/[id] interceptor", () => {
  it("fetches the trashed incident by id and renders its timeline read-only", async () => {
    params = { id: "i1" };
    const getIncident = vi
      .spyOn(trashService, "getTrashIncident")
      .mockResolvedValue({ ok: true, data: INCIDENT_DETAIL });

    renderWithProviders(<InterceptedTrashIncident />);

    await waitFor(() => expect(getIncident).toHaveBeenCalledWith("i1"));
    const dialog = await screen.findByRole("dialog", { name: "checkout latency" });
    expect(within(dialog).getByText(/restáuralo para poder editarlo/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Incidente creado")).toBeInTheDocument();
  });
});
