import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditTimeline } from "@/components/audit/AuditTimeline";
import { LanguageProvider } from "@/i18n";
import type { AuditEventListItem } from "@/types/audit";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const NOW = new Date("2026-09-02T12:00:00Z");

const ev = (over: Partial<AuditEventListItem> = {}): AuditEventListItem => ({
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

function renderTimeline(events: AuditEventListItem[]) {
  return render(
    <LanguageProvider>
      <AuditTimeline events={events} />
    </LanguageProvider>,
  );
}

beforeEach(() => vi.useFakeTimers({ now: NOW }));
afterEach(() => vi.useRealTimers());

describe("AuditTimeline", () => {
  it("groups events by calendar day (Hoy / Ayer / explicit date) preserving order", () => {
    renderTimeline([
      ev({ id: "a", occurred_at: "2026-09-02T11:00:00Z" }),
      ev({ id: "b", occurred_at: "2026-09-02T09:00:00Z" }),
      ev({ id: "c", occurred_at: "2026-09-01T23:00:00Z" }),
      ev({ id: "d", occurred_at: "2026-08-30T10:00:00Z" }),
    ]);

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("Hoy");
    expect(headings[1]).toBe("Ayer");
    expect(headings[2]).toMatch(/30 de agosto de 2026/);

    // links keep the backend order (newest first)
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/audit/a", "/audit/b", "/audit/c", "/audit/d"]);
  });

  it("gives each action a semantic node with an accessible label", () => {
    renderTimeline([
      ev({ id: "a", action: "CREATE" }),
      ev({ id: "b", action: "RESOLVED", entity_type: "Incident", entity_label: "API down" }),
    ]);
    expect(screen.getByRole("img", { name: "Creación" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Resuelto" })).toBeInTheDocument();
    expect(screen.getByText("Incidente resuelto")).toBeInTheDocument();
  });

  it("shows a CREATE summary rather than an empty 'Sin cambios'", () => {
    renderTimeline([ev({ action: "CREATE", change_count: 0, change_preview: [] })]);
    expect(screen.getByText("Nuevo activo registrado")).toBeInTheDocument();
    expect(screen.queryByText(/sin cambios/i)).not.toBeInTheDocument();
  });

  it("renders a LOGIN event with no change summary", () => {
    renderTimeline([
      ev({
        action: "LOGIN",
        entity_type: "Authentication",
        entity_label: "ops@example.com",
        change_count: 0,
        change_preview: [],
      }),
    ]);
    expect(screen.getByText("Inicio de sesión")).toBeInTheDocument();
    expect(screen.queryByText(/sin cambios/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/campo/i)).not.toBeInTheDocument();
  });

  it("previews the first changes inline and flags the rest", () => {
    renderTimeline([
      ev({
        change_count: 4,
        change_preview: [
          { field_name: "status", old_value: "Operational", new_value: "Degraded" },
          { field_name: "owner", old_value: null, new_value: "sre" },
          { field_name: "criticality", old_value: "Medium", new_value: "High" },
        ],
      }),
    ]);
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("+1 cambio más")).toBeInTheDocument();
  });

  it("summarises a RELATION_CHANGED event as added / removed labels", () => {
    renderTimeline([
      ev({
        action: "RELATION_CHANGED",
        entity_type: "Incident",
        entity_label: "API down",
        change_count: 1,
        change_preview: [
          {
            field_name: "affected_assets",
            old_value: "payments-db",
            new_value: "payments-db, prod-api-01",
          },
        ],
      }),
    ]);
    expect(screen.getByText("Activos afectados modificados")).toBeInTheDocument();
    expect(screen.getByText(/Añadidos: prod-api-01/)).toBeInTheDocument();
  });

  it("makes the whole event a link to its detail", () => {
    renderTimeline([ev({ id: "xyz" })]);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/audit/xyz");
    expect(within(link).getByText("Activo actualizado")).toBeInTheDocument();
  });

  it("segments the rail: each connector inherits its event's action colour", () => {
    const { container } = renderTimeline([
      ev({ id: "a", action: "CREATE" }),
      ev({ id: "b", action: "UPDATE" }),
      ev({ id: "c", action: "LOGIN", entity_type: "Authentication" }),
    ]);
    const rails = [...container.querySelectorAll("[data-timeline-rail]")];
    expect(rails).toHaveLength(2); // one per event except the last
    expect(rails[0]?.className).toContain("bg-audit-create");
    expect(rails[1]?.className).toContain("bg-audit-update");
    // the rail never falls back to a flat neutral border colour
    expect(rails[0]?.className).not.toMatch(/\bbg-border\b/);
  });

  it("does not render a dangling rail after the final event", () => {
    const { container } = renderTimeline([
      ev({ id: "a", occurred_at: "2026-09-02T11:00:00Z" }),
      ev({ id: "b", occurred_at: "2026-09-01T10:00:00Z" }), // different day
    ]);
    // 2 events total across 2 day-groups -> exactly 1 connector, none trailing
    expect(container.querySelectorAll("[data-timeline-rail]")).toHaveLength(1);
  });

  it("colours the node border/icon per action and keeps the accessible label", () => {
    renderTimeline([ev({ id: "a", action: "STATUS_CHANGED" })]);
    const node = screen.getByRole("img", { name: "Cambio de estado" });
    expect(node.className).toContain("text-audit-status");
    expect(node.className).toContain("ring-audit-status/40");
  });

  it("gives the event card a semantic left accent (not a tinted surface)", () => {
    renderTimeline([ev({ id: "a", action: "CREATE" })]);
    const link = screen.getByRole("link");
    expect(link.className).toContain("before:bg-audit-create/80");
    expect(link.className).toContain("bg-surface"); // card body stays neutral
  });
});
