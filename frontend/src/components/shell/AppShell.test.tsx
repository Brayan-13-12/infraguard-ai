import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
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

afterEach(() => vi.restoreAllMocks());

function renderShell() {
  vi.spyOn(authService, "fetchMe").mockResolvedValue({
    ok: true,
    data: {
      id: "u1",
      email: "user@example.com",
      is_active: true,
      created_at: "2026-08-31T00:00:00Z",
    },
  });
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppShell>
            <p>content</p>
          </AppShell>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

describe("AppShell", () => {
  it("makes the main pane the scroll container, not the document", () => {
    renderShell();
    const main = screen.getByRole("main");
    const outer = main.parentElement!.parentElement!;

    // The shell frame clips; the document/body never scrolls.
    expect(outer.className).toMatch(/h-\[100dvh\]/);
    expect(outer.className).toMatch(/overflow-hidden/);

    // The main pane owns scrolling and is a scroll-lock target for overlays.
    expect(main.className).toMatch(/overflow-y-auto/);
    expect(main).toHaveAttribute("data-scroll-lock");
  });

  it("keeps the viewport-height navigation rail as a sibling of the content", () => {
    const { container } = renderShell();
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/h-\[100dvh\]/);
    expect(aside.className).toMatch(/shrink-0/);
  });
});
