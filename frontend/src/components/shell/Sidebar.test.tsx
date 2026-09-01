import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { Sidebar } from "@/components/shell/Sidebar";
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

const MODULE_LABELS = ["Dashboard", "Assets", "Incidents", "AI Assistant", "Settings"];

afterEach(() => vi.restoreAllMocks());

function renderSidebar() {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({ ok: true, data: USER });
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <Sidebar />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

describe("Sidebar", () => {
  it("shows the product identity", () => {
    renderSidebar();
    expect(screen.getByText("InfraGuard AI")).toBeInTheDocument();
  });

  it("marks the current route as active with an English label", () => {
    renderSidebar();
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(dashboard).toHaveAttribute("aria-current", "page");
  });

  it("renders unbuilt modules as disabled 'Coming soon' items, not links", () => {
    renderSidebar();
    for (const label of ["Assets", "Incidents", "AI Assistant", "Settings"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      expect(screen.getByText(label).closest("[aria-disabled='true']")).toBeTruthy();
    }
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps module labels in English in both languages while other copy translates", async () => {
    renderSidebar();

    // Default (Spanish): module labels already English, footer action translated.
    for (const label of MODULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();

    // Switch to English: labels unchanged, footer action now English.
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument(),
    );
    for (const label of MODULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(3);

    // Back to Spanish: labels still English, footer action translated again.
    await userEvent.click(screen.getByRole("button", { name: "Español" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument(),
    );
    for (const label of MODULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("carries language, theme and a sign-out control in the footer", async () => {
    renderSidebar();
    expect(screen.getByRole("group", { name: /cambiar idioma/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /modo (claro|oscuro)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });
});
