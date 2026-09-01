import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import * as authService from "@/services/auth";
import DashboardPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const USER = {
  id: "u1",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockReset();
});

function renderDashboard() {
  return render(
    <AuthProvider>
      <DashboardPage />
    </AuthProvider>,
  );
}

describe("DashboardPage logout", () => {
  it("navigates to /login after a successful logout", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    renderDashboard();

    await screen.findByText("Your account");
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("shows an error and stays on the dashboard when logout fails", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({
      ok: false,
      error: { kind: "unexpected", message: "x" },
    });
    renderDashboard();

    await screen.findByText("Your account");
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/still signed in/i);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("Your account")).toBeInTheDocument();
  });

  it("shows a connectivity message when logout cannot reach the server", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "x" },
    });
    renderDashboard();

    await screen.findByText("Your account");
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
