import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MockAuthProvider } from "@/test/MockAuthProvider";
import { AssetsTable } from "@/components/assets/AssetsTable";
import { LanguageProvider } from "@/i18n";
import type { Asset } from "@/types/asset";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
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
      <MockAuthProvider><AssetsTable assets={assets} /></MockAuthProvider>
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

  it("translates catalog values to Spanish for display while linking English values", () => {
    renderTable([make({ asset_type: "Database", criticality: "Low" })]);
    expect(screen.getAllByText("Base de datos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Baja").length).toBeGreaterThan(0);
    expect(screen.queryByText("Database")).not.toBeInTheDocument();
  });

  it("stretches the name link over the whole row (detail) and offers an edit quick action", () => {
    renderTable([make({ id: "x", name: "web-01" })]);
    const graphLinks = screen.getAllByRole("link", { name: "Ver en grafo" });
    expect(graphLinks).toHaveLength(2);
    for (const link of graphLinks) expect(link).toHaveAttribute("href", "/assets?section=map&view=graph&asset_id=x");
    // The row-detail link (stretched) + separate actions.
    const [detail] = screen.getAllByRole("link", { name: "web-01" });
    expect(detail).toHaveAttribute("href", "/assets/x");
    expect(detail!.className).toMatch(/after:inset-0/);

    const [edit] = screen.getAllByRole("link", { name: /editar: web-01/i });
    expect(edit).toHaveAttribute("href", "/assets/x/edit");
  });

  it("highlights the freshly created row when highlightId matches", () => {
    render(
      <LanguageProvider>
        <MockAuthProvider><AssetsTable
          assets={[make({ id: "new-1", name: "created" }), make({ id: "old", name: "old-01" })]}
          highlightId="new-1"
        /></MockAuthProvider>
      </LanguageProvider>,
    );
    const highlighted = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("created"))!;
    const plain = screen.getAllByRole("row").find((r) => within(r).queryByText("old-01"))!;
    expect(highlighted.className).toContain("bg-primary/[0.06]");
    expect(plain.className).not.toContain("bg-primary/[0.06]");
  });
});
