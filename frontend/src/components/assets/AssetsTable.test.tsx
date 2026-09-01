import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetsTable } from "@/components/assets/AssetsTable";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LanguageProvider } from "@/i18n";
import type { Asset } from "@/types/asset";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (over: Partial<Asset>): Asset => ({
  id: "a1",
  name: "web-01",
  asset_type: "Server",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  hostname: null,
  ip_address: null,
  owner: "sre",
  description: null,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  ...over,
});

function renderTable(assets: Asset[]) {
  return render(
    <LanguageProvider>
      <AssetsTable assets={assets} />
    </LanguageProvider>,
  );
}

describe("AssetsTable", () => {
  it("links each asset by name and shows translated catalog + badges", () => {
    renderTable([make({ id: "x", name: "billing-db", asset_type: "Database" })]);
    const link = screen.getAllByRole("link", { name: "billing-db" })[0];
    expect(link).toHaveAttribute("href", "/assets/x");
    // catalog translated (Spanish default), badges carry text not just colour
    expect(screen.getAllByText("Base de datos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crítica").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Operativo").length).toBeGreaterThan(0);
  });

  it("marks an inactive asset", () => {
    renderTable([make({ is_active: false })]);
    expect(screen.getAllByText("Inactivo").length).toBeGreaterThan(0);
  });

  it("renders Medium criticality with the caution (amber) tone, not neutral", () => {
    renderTable([make({ criticality: "Medium" })]);
    // Rendered in both the table row and the mobile card - both must be caution.
    for (const badge of screen.getAllByText("Media")) {
      expect(badge).toHaveClass("text-caution");
      expect(badge).not.toHaveClass("text-muted-foreground");
    }
  });

  it("re-translates the catalog when the language switches to English", async () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
        <AssetsTable assets={[make({ asset_type: "Database", criticality: "Low" })]} />
      </LanguageProvider>,
    );
    expect(screen.getAllByText("Base de datos").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() =>
      expect(screen.getAllByText("Database").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Low").length).toBeGreaterThan(0);
    expect(screen.queryByText("Base de datos")).not.toBeInTheDocument();
  });
});
