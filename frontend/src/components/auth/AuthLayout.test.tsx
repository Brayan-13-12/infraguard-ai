import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/i18n";

function renderLayout() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthLayout>
          <form aria-label="sign in">
            <button type="submit">Sign in</button>
          </form>
        </AuthLayout>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

describe("AuthLayout (split experience)", () => {
  it("renders the authentication form it is given", () => {
    renderLayout();
    expect(screen.getByRole("form", { name: "sign in" })).toBeInTheDocument();
  });

  it("shows the InfraGuard brand and the product statement", () => {
    renderLayout();
    expect(screen.getAllByText("InfraGuard AI").length).toBeGreaterThan(0);
    // Present on the desktop panel and the mobile header.
    expect(
      screen.getAllByText(/inteligencia de infraestructura para equipos tecnológicos/i).length,
    ).toBeGreaterThan(0);
  });

  it("lists the restrained capability highlights, no fake stats", () => {
    renderLayout();
    expect(screen.getByText("Visibilidad del inventario")).toBeInTheDocument();
    expect(screen.getByText("Inteligencia operacional")).toBeInTheDocument();
    expect(screen.getByText("Análisis asistido por IA")).toBeInTheDocument();
  });

  it("keeps only the contextual theme toggle - no language switcher", async () => {
    renderLayout();
    expect(
      await screen.findByRole("button", { name: /modo (claro|oscuro)/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /cambiar idioma/i }),
    ).not.toBeInTheDocument();
  });

  it("puts the theme toggle inside the auth card, not floating at page level", async () => {
    renderLayout();
    const form = screen.getByRole("form", { name: "sign in" });
    const toggle = await screen.findByRole("button", { name: /modo (claro|oscuro)/i });

    // Walk up from the form to the nearest ancestor that also holds the toggle.
    let card: HTMLElement | null = form.parentElement;
    while (card && !card.contains(toggle)) card = card.parentElement;

    expect(card).not.toBeNull();
    expect(card).not.toBe(document.body);
    expect(card?.className).toContain("rounded-2xl");
  });

  it("no longer renders the old single-card marketing copy", () => {
    renderLayout();
    expect(
      screen.queryByText(/asset visibility across your estate/i),
    ).not.toBeInTheDocument();
  });
});
