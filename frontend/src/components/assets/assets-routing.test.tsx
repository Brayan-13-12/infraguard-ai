import { expect, it, vi } from "vitest";
import TopologyPage from "@/app/(app)/topology/page";
import DependenciesPage from "@/app/(app)/dependencies/page";
import AssetsModalPage from "@/app/(app)/assets/@modal/page";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

it.each([
  [TopologyPage, "graph"],
  [DependenciesPage, "relations"],
] as const)("preserves legacy deep-link context in Assets", async (Page, view) => {
  await Page({ searchParams: Promise.resolve({ asset_id: "a1", q: "database", view: "old" }) });
  const url = new URL(redirect.mock.calls.at(-1)![0], "http://localhost");
  expect(url.pathname).toBe("/assets");
  expect(url.searchParams.get("section")).toBe("map");
  expect(url.searchParams.get("view")).toBe(view);
  expect(url.searchParams.get("asset_id")).toBe("a1");
  expect(url.searchParams.get("q")).toBe("database");
});

it("clears the modal slot when navigating from asset detail to Assets tabs", () => {
  expect(AssetsModalPage()).toBeNull();
});
