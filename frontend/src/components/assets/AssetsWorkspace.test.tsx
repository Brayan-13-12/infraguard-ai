import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import { AssetsWorkspace } from "./AssetsWorkspace";
import { ViewInGraph } from "./ViewInGraph";

let params = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => params, useRouter: () => ({ push }) }));
vi.mock("./AssetsBrowser", () => ({ AssetsBrowser: () => <p>Inventory workspace</p> }));
vi.mock("@/components/topology/TopologyWorkspace", () => ({ TopologyWorkspace: () => <p>Graph workspace</p> }));
vi.mock("@/components/dependencies/RelationshipEditor", () => ({ RelationshipEditor: () => <p>Relationships workspace</p> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

beforeEach(() => { params = new URLSearchParams(); push.mockClear(); });
function show(permissions = makeUser().permissions) {
  return render(<LanguageProvider><MockAuthProvider user={makeUser({ permissions })}><AssetsWorkspace /><ViewInGraph assetId="a1" /></MockAuthProvider></LanguageProvider>);
}

it("defaults to inventory and navigates to the infrastructure map", async () => {
  show();
  expect(screen.getByRole("tab", { name: "Inventario" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Inventory workspace")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Mapa de infraestructura" }));
  expect(push).toHaveBeenCalledWith("/assets?section=map&view=graph", { scroll: false });
  expect(screen.getByRole("link", { name: "Ver en grafo" })).toHaveAttribute("href", "/assets?section=map&view=graph&asset_id=a1");
});

it("opens the graph deep link and keeps asset focus when switching to relationships", async () => {
  params = new URLSearchParams("section=map&view=graph&asset_id=a1");
  show();
  expect(screen.getByRole("tab", { name: "Grafo" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Graph workspace")).toBeInTheDocument();
  expect(screen.queryByText("Inventory workspace")).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: "Relaciones" }));
  expect(push).toHaveBeenCalledWith("/assets?section=map&view=relations&asset_id=a1", { scroll: false });
});

it("reuses the relationships workspace for the internal relations view", () => {
  params = new URLSearchParams("section=map&view=relations");
  show();
  expect(screen.getByText("Relationships workspace")).toBeInTheDocument();
  expect(screen.queryByText("Graph workspace")).toBeNull();
});

it("hides map entry points without relationship permission and guards deep links", () => {
  params = new URLSearchParams("section=map&view=graph");
  show(["assets.read"]);
  expect(screen.queryByRole("tab", { name: "Mapa de infraestructura" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Ver en grafo" })).toBeNull();
  expect(screen.queryByText("Graph workspace")).toBeNull();
});

it("preserves relationships-only access while preventing graph asset reads", () => {
  params = new URLSearchParams("section=map&view=relations");
  show(["relationships.read"]);
  expect(screen.getByText("Relationships workspace")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Ver en grafo" })).toBeNull();
});

it("opens the authorized relationships view by default for relationship-only readers", () => {
  show(["relationships.read"]);
  expect(screen.getByText("Relationships workspace")).toBeInTheDocument();
  expect(screen.queryByText("Graph workspace")).toBeNull();
});
