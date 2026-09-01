import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { MobileNav } from "@/components/shell/MobileNav";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/i18n";
import * as authService from "@/services/auth";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const USER = {
  id: "u1",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

function renderNav() {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <MobileNav />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

const openTrigger = /abrir menú de navegación/i;

describe("MobileNav", () => {
  it("is closed initially", () => {
    renderNav();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: openTrigger })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens the drawer with navigation plus language, theme and sign-out", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: openTrigger }));

    const dialog = await screen.findByRole("dialog", { name: /navegación principal/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /cambiar idioma/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /modo (claro|oscuro)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: openTrigger }));
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes after choosing a destination", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: openTrigger }));
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
