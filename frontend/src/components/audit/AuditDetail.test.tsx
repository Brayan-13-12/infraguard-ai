import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuditDetailContent, AuditEventHeader } from "@/components/audit/AuditDetail";
import { LanguageProvider } from "@/i18n";
import type { AuditEventDetail } from "@/types/audit";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: AuditEventDetail = {
  id: "e1",
  occurred_at: "2026-09-02T10:00:00Z",
  action: "UPDATE",
  entity_type: "Asset",
  entity_id: "a1",
  entity_label: "payments-db",
  actor_user_id: "u1",
  actor_email: "ops@example.com",
  request_id: "req-123",
  ip_address: "203.0.113.7",
  user_agent: "Mozilla/5.0",
  metadata: null,
  changes: [
    { field_name: "status", old_value: "Operational", new_value: "Degraded" },
    { field_name: "owner", old_value: null, new_value: "sre" },
  ],
};

function renderDetail(event: AuditEventDetail) {
  return render(
    <LanguageProvider>
      <AuditDetailContent event={event} />
    </LanguageProvider>,
  );
}

describe("AuditEventHeader", () => {
  it("shows the action icon, an entity-aware title and the entity + timestamp", () => {
    render(
      <LanguageProvider>
        <AuditEventHeader event={base} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Activo actualizado" })).toBeInTheDocument();
    expect(screen.getByText(/payments-db/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Actualización" })).toBeInTheDocument();
  });
});

describe("AuditEventHeader — DELETE / RESTORE", () => {
  it("renders a DELETE event with the red trash icon and 'Activo eliminado'", () => {
    render(
      <LanguageProvider>
        <AuditEventHeader event={{ ...base, action: "DELETE" }} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Activo eliminado" })).toBeInTheDocument();
    const icon = screen.getByRole("img", { name: "Eliminación" });
    expect(icon.className).toContain("text-audit-delete");
  });

  it("renders a RESTORE event with the violet restore icon and 'Incidente restaurado'", () => {
    render(
      <LanguageProvider>
        <AuditEventHeader
          event={{ ...base, action: "RESTORE", entity_type: "Incident", entity_label: "API down" }}
        />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Incidente restaurado" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Restauración" }).className).toContain(
      "text-audit-restore",
    );
  });
});

describe("AuditDetailContent", () => {
  it("keeps the entity link on a DELETE event so trashed history stays navigable", () => {
    renderDetail({ ...base, action: "DELETE", changes: [] });
    expect(screen.getByRole("link", { name: /ver activo/i })).toHaveAttribute(
      "href",
      "/assets/a1",
    );
  });

  it("renders each field change as before -> after", () => {
    renderDetail(base);
    expect(screen.getByRole("heading", { name: "Cambios" })).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    // null "before" renders as an explicit empty marker, not the string "null"
    expect(screen.getAllByText("(vacío)").length).toBeGreaterThan(0);
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows the request context", () => {
    renderDetail(base);
    expect(screen.getByRole("heading", { name: "Contexto" })).toBeInTheDocument();
    expect(screen.getByText("req-123")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    expect(screen.getByText("Mozilla/5.0")).toBeInTheDocument();
  });

  it("links to the related asset", () => {
    renderDetail(base);
    expect(screen.getByRole("link", { name: /ver activo/i })).toHaveAttribute(
      "href",
      "/assets/a1",
    );
  });

  it("collapses a long text change instead of dumping it inline", () => {
    renderDetail({
      ...base,
      changes: [
        {
          field_name: "description",
          old_value: "short",
          new_value: "a very long replacement description ".repeat(4),
        },
      ],
    });
    // stacked before/after blocks carry column labels
    expect(screen.getByText("Antes")).toBeInTheDocument();
    expect(screen.getByText("Después")).toBeInTheDocument();
  });

  it("renders no Changes section at all for a LOGIN event", () => {
    renderDetail({
      ...base,
      action: "LOGIN",
      entity_type: "Authentication",
      entity_id: "u1",
      entity_label: "ops@example.com",
      changes: [],
    });
    expect(screen.queryByRole("heading", { name: "Cambios" })).not.toBeInTheDocument();
    expect(screen.queryByText(/evento de sesión/i)).not.toBeInTheDocument();
    // still shows request context
    expect(screen.getByText("req-123")).toBeInTheDocument();
  });

  it("surfaces CREATE snapshot metadata and states there are no field changes", () => {
    renderDetail({
      ...base,
      action: "CREATE",
      entity_id: null,
      entity_label: null,
      changes: [],
      metadata: { environment: "Production", criticality: "Critical" },
    });
    expect(screen.getByRole("heading", { name: "Detalles" })).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(
      screen.getByText("Este evento no registra cambios de campos."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ver/i })).not.toBeInTheDocument();
  });
});
