import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditBrowser } from "@/components/audit/AuditBrowser";
import { LanguageProvider } from "@/i18n";
import * as auditService from "@/services/audit";
import type { AuditEventListItem, AuditPage, AuditSummary } from "@/types/audit";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/audit",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const event = (over: Partial<AuditEventListItem> = {}): AuditEventListItem => ({
  id: "e1",
  occurred_at: "2026-09-02T10:00:00Z",
  action: "UPDATE",
  entity_type: "Asset",
  entity_id: "a1",
  entity_label: "payments-db",
  actor_user_id: "u1",
  actor_email: "ops@example.com",
  change_count: 1,
  change_preview: [{ field_name: "status", old_value: "Operational", new_value: "Degraded" }],
  ...over,
});

const page = (items: AuditEventListItem[], over: Partial<AuditPage> = {}): AuditPage => ({
  items,
  page: 1,
  page_size: 25,
  total: items.length,
  total_pages: 1,
  ...over,
});

const SUMMARY: AuditSummary = {
  events_today: 4,
  changes_today: 6,
  logins_today: 2,
  active_actors_today: 1,
};

function renderBrowser() {
  return render(
    <LanguageProvider>
      <AuditBrowser />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  mockSearchParams = new URLSearchParams("");
  vi.spyOn(auditService, "getAuditSummary").mockResolvedValue({ ok: true, data: SUMMARY });
  vi.spyOn(auditService, "listAudit").mockResolvedValue({ ok: true, data: page([event()]) });
});

afterEach(() => vi.restoreAllMocks());

describe("AuditBrowser (timeline)", () => {
  it("shows the English header, Spanish subtitle and a compact activity strip", async () => {
    renderBrowser();
    expect(screen.getByRole("heading", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByText(/registro de actividad y cambios/i)).toBeInTheDocument();
    expect(await screen.findByText("Eventos hoy")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders a timeline of events readable without opening the detail", async () => {
    vi.spyOn(auditService, "listAudit").mockResolvedValue({
      ok: true,
      data: page([
        event({ id: "e1" }),
        event({ id: "e2", occurred_at: "2026-09-01T22:00:00Z", entity_label: "web-01" }),
      ]),
    });
    renderBrowser();

    expect(await screen.findAllByText("Activo actualizado")).toHaveLength(2);
    expect(screen.getByText("payments-db")).toBeInTheDocument();
    expect(screen.getByText("web-01")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /activo actualizado.*web-01|web-01/i })).toBeTruthy();
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/audit/e1", "/audit/e2"]);
  });

  it("shows a LOGIN event without a 'Sin cambios' label", async () => {
    vi.spyOn(auditService, "listAudit").mockResolvedValue({
      ok: true,
      data: page([
        event({
          id: "l1",
          action: "LOGIN",
          entity_type: "Authentication",
          entity_label: "ops@example.com",
          change_count: 0,
          change_preview: [],
        }),
      ]),
    });
    renderBrowser();
    expect(await screen.findByText("Inicio de sesión")).toBeInTheDocument();
    expect(screen.queryByText(/sin cambios/i)).not.toBeInTheDocument();
  });

  it("shows a short change preview inline and a '+N' line when there are more", async () => {
    vi.spyOn(auditService, "listAudit").mockResolvedValue({
      ok: true,
      data: page([
        event({
          change_count: 4,
          change_preview: [
            { field_name: "status", old_value: "Operational", new_value: "Degraded" },
            { field_name: "owner", old_value: null, new_value: "sre" },
            { field_name: "criticality", old_value: "Medium", new_value: "High" },
          ],
        }),
      ]),
    });
    renderBrowser();
    expect(await screen.findByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("+1 cambio más")).toBeInTheDocument();
  });

  it("shows the empty state when there are no events", async () => {
    vi.spyOn(auditService, "listAudit").mockResolvedValue({ ok: true, data: page([]) });
    renderBrowser();
    expect(await screen.findByText("No hay eventos registrados.")).toBeInTheDocument();
  });

  it("shows an error with a retry that refetches", async () => {
    const listAudit = vi
      .spyOn(auditService, "listAudit")
      .mockResolvedValue({ ok: false, error: { kind: "unexpected" } });
    renderBrowser();
    expect(await screen.findByText("No se pudo cargar el registro")).toBeInTheDocument();

    listAudit.mockResolvedValue({ ok: true, data: page([event()]) });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("payments-db")).toBeInTheDocument();
  });

  it("keeps filters collapsed until toggled, then pushes the action filter to the URL", async () => {
    renderBrowser();
    await screen.findByText("payments-db");

    expect(screen.queryByLabelText("Acción")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /filtros/i }));

    await userEvent.selectOptions(
      screen.getByLabelText("Acción"),
      screen.getByRole("option", { name: "Inicio de sesión" }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("action=LOGIN"),
        expect.anything(),
      ),
    );
  });

  it("debounces the search into the URL and the query", async () => {
    renderBrowser();
    await screen.findByText("payments-db");

    await userEvent.type(screen.getByPlaceholderText(/buscar por usuario/i), "payments");

    await waitFor(
      () =>
        expect(auditService.listAudit).toHaveBeenCalledWith(
          expect.objectContaining({ q: "payments", page: 1 }),
        ),
      { timeout: 2000 },
    );
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringContaining("q=payments"),
      expect.anything(),
    );
  });

  it("hydrates filters from the URL and opens the panel", async () => {
    mockSearchParams = new URLSearchParams("action=LOGIN&entity_type=Authentication");
    renderBrowser();
    await waitFor(() =>
      expect(auditService.listAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LOGIN", entityType: "Authentication" }),
      ),
    );
    expect(screen.getByLabelText("Acción")).toHaveValue("LOGIN");
  });

  it("appends the next server page with 'Cargar más' and de-duplicates by id", async () => {
    const first = page([event({ id: "e1" })], { total: 2, total_pages: 2 });
    const second = page(
      [event({ id: "e1" }), event({ id: "e2", entity_label: "web-01" })],
      { page: 2, total: 2, total_pages: 2 },
    );
    const listAudit = vi
      .spyOn(auditService, "listAudit")
      .mockResolvedValueOnce({ ok: true, data: first });
    renderBrowser();
    await screen.findByText("payments-db");

    listAudit.mockResolvedValueOnce({ ok: true, data: second });
    await userEvent.click(screen.getByRole("button", { name: /cargar más/i }));

    await waitFor(() => expect(screen.getByText("web-01")).toBeInTheDocument());
    expect(screen.getAllByText("payments-db")).toHaveLength(1);
    expect(listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });
});
