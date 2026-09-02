import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IncidentTimeline } from "@/components/incidents/IncidentTimeline";
import { LanguageProvider } from "@/i18n";
import type { IncidentEvent } from "@/types/incident";

const ev = (over: Partial<IncidentEvent>): IncidentEvent => ({
  id: "e1",
  type: "CREATED",
  message: "Incidente creado",
  created_by: "u1",
  actor_email: "sre@example.com",
  created_at: "2026-09-01T09:00:00Z",
  ...over,
});

function renderTimeline(events: IncidentEvent[]) {
  return render(
    <LanguageProvider>
      <IncidentTimeline events={events} />
    </LanguageProvider>,
  );
}

describe("IncidentTimeline", () => {
  it("renders each event message and actor in order", () => {
    renderTimeline([
      ev({ id: "e1", message: "Incidente creado" }),
      ev({
        id: "e2",
        type: "STATUS_CHANGED",
        message: "Estado cambió de Abierto a Investigando",
      }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Incidente creado");
    expect(items[1]).toHaveTextContent("Estado cambió de Abierto a Investigando");
    expect(screen.getAllByText(/por sre@example.com/i).length).toBeGreaterThan(0);
  });

  it("falls back to 'Sistema' when there is no actor", () => {
    renderTimeline([ev({ actor_email: null })]);
    expect(screen.getByText(/por Sistema/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no events", () => {
    renderTimeline([]);
    expect(screen.getByText(/sin actividad todavía/i)).toBeInTheDocument();
  });
});
