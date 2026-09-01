import { render, screen, within } from "@testing-library/react";
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

/** Walk up from `el` to the nearest ancestor that also contains the brand text. */
function enclosingCard(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el;
  while (node && within(node).queryByText("InfraGuard AI") === null) {
    node = node.parentElement;
  }
  if (!node) throw new Error("no common card ancestor with the brand");
  return node;
}

describe("AuthLayout", () => {
  it("has no page-level header - the brand appears once, inside the card", () => {
    renderLayout();
    expect(screen.getAllByText("InfraGuard AI")).toHaveLength(1);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("keeps brand, language switcher and theme toggle together inside the card", async () => {
    renderLayout();
    const form = screen.getByRole("form", { name: "sign in" });
    const card = enclosingCard(form);

    expect(within(card).getByText("InfraGuard AI")).toBeInTheDocument();
    expect(
      within(card).getByRole("group", { name: /cambiar idioma/i }),
    ).toBeInTheDocument();
    expect(
      await within(card).findByRole("button", { name: /modo (claro|oscuro)/i }),
    ).toBeInTheDocument();
  });

  it("no longer renders the old marketing panel", () => {
    renderLayout();
    expect(
      screen.queryByText(/asset visibility across your estate/i),
    ).not.toBeInTheDocument();
  });
});
