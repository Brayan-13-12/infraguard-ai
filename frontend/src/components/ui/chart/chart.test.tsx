import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChartDataTable } from "@/components/ui/chart/ChartDataTable";
import { DonutChart } from "@/components/ui/chart/DonutChart";
import { HorizontalBarChart } from "@/components/ui/chart/HorizontalBarChart";
import { LanguageProvider } from "@/i18n";
import type { ChartDatum } from "@/components/ui/chart/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const DATA: ChartDatum[] = [
  { key: "Critical", label: "Crítica", value: 3, color: "hsl(var(--danger))", href: "/assets?criticality=Critical" },
  { key: "High", label: "Alta", value: 1, color: "hsl(var(--warning))", href: "/assets?criticality=High" },
  { key: "Low", label: "Baja", value: 0, color: "hsl(var(--success))", href: "/assets?criticality=Low" },
];

const wrap = (ui: React.ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe("ChartDataTable", () => {
  it("shows every category with its count and percentage of the total", () => {
    wrap(<ChartDataTable data={DATA} caption="Datos" />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Crítica")).toBeInTheDocument();
    expect(within(table).getByText("3")).toBeInTheDocument();
    // 3 of 4 -> 75%
    expect(within(table).getByText(/75\s*% del total/i)).toBeInTheDocument();
    expect(within(table).getByText("Baja")).toBeInTheDocument(); // zero-count still listed
  });

  it("makes each row a drill-down link and shows the Spanish filter hint", () => {
    wrap(<ChartDataTable data={DATA} caption="Datos" />);
    expect(screen.getByRole("link", { name: "Crítica" })).toHaveAttribute(
      "href",
      "/assets?criticality=Critical",
    );
    expect(screen.getByText(/clic para filtrar/i)).toBeInTheDocument();
  });

  it("uses an explicit total for the percentage denominator", () => {
    wrap(<ChartDataTable data={DATA} caption="Datos" total={10} />);
    expect(screen.getByText(/30\s*% del total/i)).toBeInTheDocument(); // 3 / 10
  });
});

describe("DonutChart", () => {
  it("renders an accessible companion table alongside the (decorative) chart", () => {
    wrap(
      <DonutChart
        data={DATA}
        caption="Activos por criticidad"
        centerLabel={{ value: 4, text: "Total" }}
      />,
    );
    expect(screen.getByRole("table", { name: /activos por criticidad/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alta" })).toHaveAttribute(
      "href",
      "/assets?criticality=High",
    );
  });
});

describe("HorizontalBarChart", () => {
  it("renders an accessible companion table with drill-down links", () => {
    wrap(<HorizontalBarChart data={DATA} caption="Activos por tipo" />);
    expect(screen.getByRole("table", { name: /activos por tipo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crítica" })).toBeInTheDocument();
  });
});
