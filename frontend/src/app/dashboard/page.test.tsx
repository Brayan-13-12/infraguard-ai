import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/i18n";
import * as authService from "@/services/auth";
import DashboardPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/dashboard",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const USER = {
  id: "user-1234",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockReset();
});

function renderDashboard() {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

describe("DashboardPage", () => {
  it("renders the app shell with the dashboard active (English heading + nav label)", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the heading English but translates the surrounding copy", async () => {
    renderDashboard();
    await screen.findByRole("heading", { name: "Dashboard", level: 1 });
    // Spanish is the default - description is translated, heading is not.
    expect(screen.getByText(/hola de nuevo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() =>
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows the account summary from the authenticated user", async () => {
    renderDashboard();
    expect(await screen.findByText("Tu cuenta")).toBeInTheDocument();
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("user-1234")).toBeInTheDocument();
  });

  it("presents platform modules truthfully", async () => {
    renderDashboard();
    const modules = (await screen.findByText("Módulos de la plataforma")).closest("section")!;
    expect(within(modules).getByText("Authentication")).toBeInTheDocument();
    expect(within(modules).getByText("Activo")).toBeInTheDocument();
    expect(within(modules).getAllByText("Coming soon")).toHaveLength(3);
  });

  it("signs out from the sidebar with an explicit confirm step", async () => {
    vi.spyOn(authService, "logout").mockResolvedValue({ ok: true });
    renderDashboard();

    await screen.findByText("Tu cuenta");
    await userEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
