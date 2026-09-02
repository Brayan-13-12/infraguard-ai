import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { LanguageProvider } from "@/i18n";
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

function renderButton() {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
  return render(
    <LanguageProvider>
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>
    </LanguageProvider>,
  );
}

describe("LogoutButton (inline)", () => {
  it("requires an explicit confirm before signing out", async () => {
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    // Nothing happened yet - a confirm step is shown.
    expect(authService.logout).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("cancels back to the resting state", async () => {
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
  });

  it("keeps the session and explains when sign-out fails", async () => {
    vi.spyOn(authService, "logout").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "x" },
    });
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/tu sesión sigue activa/i);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("LogoutButton (collapsed rail)", () => {
  it("opens a confirmation dialog and signs out on confirm", async () => {
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
    render(
      <LanguageProvider>
        <AuthProvider>
          <LogoutButton collapsed />
        </AuthProvider>
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/¿deseas salir de infraguard ai\?/i);

    await userEvent.click(within(dialog).getByRole("button", { name: /^salir$/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
