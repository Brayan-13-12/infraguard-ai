import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemHealthPanel } from "@/components/SystemHealth";
import * as healthService from "@/services/health";

afterEach(() => {
  vi.restoreAllMocks();
});

const FRONTEND = "Frontend";
const BACKEND = "API del backend";
const DATABASE = "Base de datos PostgreSQL";
const OPERATIONAL = "Operativo";
const UNAVAILABLE = "No disponible";
const UNKNOWN = "Desconocido";

function row(name: string): HTMLElement {
  const label = screen.getByText(name);
  const li = label.closest("li");
  if (!li) throw new Error(`row not found for ${name}`);
  return li;
}

describe("SystemHealthPanel", () => {
  it("shows the frontend as operational immediately", () => {
    vi.spyOn(healthService, "fetchBackendHealth").mockReturnValue(new Promise(() => {}));
    render(<SystemHealthPanel />);
    expect(within(row(FRONTEND)).getByText(OPERATIONAL)).toBeInTheDocument();
  });

  it("renders backend and database as operational when the API is healthy", async () => {
    vi.spyOn(healthService, "fetchBackendHealth").mockResolvedValue({
      ok: true,
      data: { status: "ready", service: "infraguard-api", database: "healthy" },
    });

    render(<SystemHealthPanel />);

    await waitFor(() =>
      expect(within(row(BACKEND)).getByText(OPERATIONAL)).toBeInTheDocument(),
    );
    expect(within(row(DATABASE)).getByText(OPERATIONAL)).toBeInTheDocument();
  });

  it("marks the database unavailable but backend operational on a degraded response", async () => {
    vi.spyOn(healthService, "fetchBackendHealth").mockResolvedValue({
      ok: true,
      data: { status: "not_ready", service: "infraguard-api", database: "unhealthy" },
    });

    render(<SystemHealthPanel />);

    await waitFor(() =>
      expect(within(row(DATABASE)).getByText(UNAVAILABLE)).toBeInTheDocument(),
    );
    expect(within(row(BACKEND)).getByText(OPERATIONAL)).toBeInTheDocument();
  });

  it("marks the backend unavailable when the API is unreachable", async () => {
    vi.spyOn(healthService, "fetchBackendHealth").mockResolvedValue({
      ok: false,
      reason: "unreachable",
      detail: "Could not reach the backend API",
    });

    render(<SystemHealthPanel />);

    await waitFor(() =>
      expect(within(row(BACKEND)).getByText(UNAVAILABLE)).toBeInTheDocument(),
    );
    expect(within(row(DATABASE)).getByText(UNKNOWN)).toBeInTheDocument();
  });

  it("re-queries the API when Refresh is clicked", async () => {
    const spy = vi
      .spyOn(healthService, "fetchBackendHealth")
      .mockResolvedValueOnce({
        ok: false,
        reason: "unreachable",
        detail: "Could not reach the backend API",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { status: "ready", service: "infraguard-api", database: "healthy" },
      });

    render(<SystemHealthPanel />);

    await waitFor(() =>
      expect(within(row(BACKEND)).getByText(UNAVAILABLE)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /actualizar/i }));

    await waitFor(() =>
      expect(within(row(BACKEND)).getByText(OPERATIONAL)).toBeInTheDocument(),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
