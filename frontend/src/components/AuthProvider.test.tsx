import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/components/AuthProvider";
import * as authService from "@/services/auth";

const USER = {
  id: "u1",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { status, user, error, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? "-"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <button onClick={() => void login("user@example.com", "pw")}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  it("starts loading then becomes authenticated when /me succeeds", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    renderProbe();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });

  it("becomes unauthenticated when /me returns 401", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated" },
    });
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
  });

  it("surfaces a message when the backend is unreachable", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "x" },
    });
    function ErrProbe() {
      const { error } = useAuth();
      return <span data-testid="err">{error ?? "none"}</span>;
    }
    render(
      <AuthProvider>
        <ErrProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("err")).toHaveTextContent(/conectar con el servidor/i),
    );
  });

  it("login transitions to authenticated", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated" },
    });
    vi.spyOn(authService, "login").mockResolvedValue({ ok: true, data: USER });
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    await userEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
  });

  it("successful logout transitions to unauthenticated and clears the user", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("-");
  });

  it("keeps the session authenticated when the backend logout fails", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({
      ok: false,
      error: { kind: "unexpected", message: "x" },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    // Still authenticated, user retained, and a message surfaced.
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(/algo salió mal/i),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });

  it("keeps the session authenticated when logout hits a network failure", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "x" },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(/conectar con el servidor/i),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });

  it("logout() returns the structured result to the caller", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });

    let captured: unknown;
    function Caller() {
      const { logout } = useAuth();
      return <button onClick={async () => { captured = await logout(); }}>go</button>;
    }
    render(
      <AuthProvider>
        <Caller />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(captured).toEqual({ ok: true }));
  });
});
