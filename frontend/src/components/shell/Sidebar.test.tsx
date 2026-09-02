import { render, screen } from "@testing-library/react";
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

const MODULE_LABELS = [
  "Dashboard",
  "Assets",
  "Incidents",
  "Audit",
  "AI Assistant",
  "Settings",
];

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

  it("links Assets as an active route", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Assets" })).toHaveAttribute("href", "/assets");
  });

  it("links Incidents as an active route", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Incidents" })).toHaveAttribute(
      "href",
      "/incidents",
    );
  });

  it("links Audit as an active route with an English label", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Audit" })).toHaveAttribute("href", "/audit");
    expect(screen.queryByText("Auditoría")).not.toBeInTheDocument();
  });

  it("is a single flat list with no visible section headings", () => {
    renderSidebar();
    for (const heading of ["INFRASTRUCTURE", "OPERATIONS", "INTELLIGENCE", "SYSTEM"]) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
    for (const heading of [/infraestructura/i, /operaciones/i, /inteligencia/i]) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
  });

  it("renders unbuilt modules as disabled items with a quiet marker, not links", () => {
    renderSidebar();
    for (const label of ["AI Assistant", "Settings"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      const row = screen.getByText(label).closest("[aria-disabled='true']");
      expect(row).toBeTruthy();
      expect(row).toHaveAttribute("title", "Próximamente");
    }
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.queryByText(/·\s*soon/i)).not.toBeInTheDocument();
  });

  it("keeps module labels in English", () => {
    renderSidebar();
    for (const label of MODULE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("carries the identity, theme toggle and a sign-out control in the footer (no language switcher)", async () => {
    renderSidebar();
    expect(screen.queryByRole("group", { name: /cambiar idioma/i })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /modo (claro|oscuro)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it("is a viewport-height flex column so the footer stays inside the rail", async () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("aside")!;
    // Viewport-height flex column - the shell owns the scroll (no absolute positioning).
    expect(aside.className).toMatch(/h-\[100dvh\]/);
    expect(aside.className).toMatch(/flex-col/);
    expect(aside.className).toMatch(/shrink-0/);

    // The sign-out and identity live inside the <aside>, not floating elsewhere.
    const signOut = await screen.findByRole("button", { name: /^salir$/i });
    expect(aside.contains(signOut)).toBe(true);
    expect(aside.contains(await screen.findByText("user@example.com"))).toBe(true);
  });

  it("collapses to an icon rail and persists the choice", async () => {
    renderSidebar();
    const collapse = await screen.findByRole("button", { name: /contraer la navegación/i });
    await userEvent.click(collapse);

    // Visible text labels are gone; the icon link keeps an accessible name via aria-label.
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("aria-label", "Dashboard");
    expect(dashboard.querySelector("span.flex-1")).toBeNull();
    expect(screen.getByRole("button", { name: /expandir la navegación/i })).toBeInTheDocument();
    expect(window.localStorage.getItem("infraguard.sidebar-collapsed")).toBe("1");
  });
});
