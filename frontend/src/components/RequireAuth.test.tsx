import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import * as authService from "@/services/auth";

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

function renderGuarded() {
  return render(
    <AuthProvider>
      <RequireAuth>
        <div>secret dashboard</div>
      </RequireAuth>
    </AuthProvider>,
  );
}

describe("RequireAuth", () => {
  it("shows a checking state while the session resolves", () => {
    vi.spyOn(authService, "fetchMe").mockReturnValue(new Promise(() => {}));
    renderGuarded();
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    renderGuarded();
    expect(await screen.findByText("secret dashboard")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated" },
    });
    renderGuarded();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
  });

  it("redirects to /login when the session has expired (invalid token -> 401)", async () => {
    vi.spyOn(authService, "fetchMe").mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated" },
    });
    renderGuarded();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
