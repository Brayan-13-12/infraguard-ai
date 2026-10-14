import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { expect, it } from "vitest";
import { LanguageProvider } from "@/i18n";
import { AssetNode, type AssetFlowNode } from "./AssetNode";
import { NODE_WIDTH, NODE_HEIGHT } from "./layout";

it("renders a circular icon with the asset name below and details in its tooltip", () => {
  const props = {
    id: "db", selected: true,
    data: { name: "prod-db-primary", assetType: "Database", status: "Offline", criticality: "Critical", isActive: true, isRoot: true, faded: false },
  } as NodeProps<AssetFlowNode>;
  const { container } = render(<LanguageProvider><ReactFlowProvider><AssetNode {...props} /></ReactFlowProvider></LanguageProvider>);
  expect(screen.getByText("prod-db-primary")).toHaveClass("font-mono");
  expect(screen.queryByText(/Base de datos/)).toBeNull();
  expect(container.querySelector("[title]")?.getAttribute("title")).toContain("Base de datos");
  expect(screen.getByRole("img")).toHaveAccessibleName();
  const node = container.querySelector("[title]")!;
  expect(node).toHaveStyle({ width: `${NODE_WIDTH}px`, height: `${NODE_HEIGHT}px` });
  expect(node.getAttribute("title")).toContain("prod-db-primary");
  expect(node.getAttribute("title")).toContain(" · ");
  expect(node.firstElementChild).toHaveClass("rounded-full", "ring-4", "h-10", "w-10");
});

it("keeps the full long name available and distinguishes inactive nodes without color alone", () => {
  const name = "production-application-with-a-long-technical-hostname";
  const props = { id: "app", selected: false, data: { name, assetType: "Application", status: "Operational", criticality: "Low", isActive: false, isRoot: false, faded: true } } as NodeProps<AssetFlowNode>;
  const { container } = render(<LanguageProvider><ReactFlowProvider><AssetNode {...props} /></ReactFlowProvider></LanguageProvider>);
  expect(screen.getByText(name)).toHaveClass("truncate");
  const node = container.querySelector("[title]")!;
  expect(node.getAttribute("title")).toContain(name);
  expect(node).toHaveClass("opacity-40");
  expect(node.firstElementChild).toHaveClass("border-dashed");
});
