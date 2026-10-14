import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import * as assets from "@/services/assets";
import * as relationships from "@/services/relationships";
import type { Asset } from "@/types/asset";
import type { RelationshipDetail } from "@/types/relationship";
import type { SubgraphResponse } from "@/types/topology";
import { RelationshipEditor } from "./RelationshipEditor";

const center = vi.hoisted(() => vi.fn());
const drop = vi.hoisted(() => vi.fn());
let connect: ((connection: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null }) => void) | undefined;
vi.mock("@/components/topology/TopologyCanvas", () => ({ TopologyCanvas: forwardRef(function Canvas(props: {
  onConnect?: typeof connect;
  data: SubgraphResponse; persistedRevision: number; onNodeSelect: (id: string) => void; onEdgeSelect: (id: string) => void;
}, ref) {
  connect = props.onConnect;
  useImperativeHandle(ref, () => ({ dropNode: drop, centerNode: center, fitView: vi.fn(), resetView: vi.fn() }));
  return <div data-testid="canvas" data-revision={props.persistedRevision}>
    {props.data.nodes.map((node) => <button key={node.id} onClick={() => props.onNodeSelect(node.id)}>{node.name}</button>)}
    {props.data.edges.map((edge) => <button key={edge.id} onClick={() => props.onEdgeSelect(edge.id)}>{edge.id}:{edge.relationship_type}:{edge.source_asset_id}:{edge.target_asset_id}</button>)}
  </div>;
}) }));
const a: Asset = { id: "a", name: "api", asset_type: "Application", environment: "Production", criticality: "High", status: "Operational", is_active: true, hostname: null, ip_address: null, owner: null, description: null, created_at: "", updated_at: "" };
const b: Asset = { ...a, id: "b", name: "database", asset_type: "Database" };
const relation: RelationshipDetail = { id: "r1", source_asset_id: "a", target_asset_id: "b", relationship_type: "uses", description: "Existing", source: a, target: b, created_at: "", updated_at: "" };
const grouped = (items: RelationshipDetail[] = []) => ({ outgoing: items, incoming: [], counts: { incoming: 0, outgoing: items.length, total: items.length } });
beforeEach(() => {
  vi.spyOn(assets, "listAssets").mockResolvedValue({ ok: true, data: { items: [a, b], page: 1, page_size: 30, total: 2, total_pages: 1 } });
  vi.spyOn(relationships, "getAssetRelationships").mockResolvedValue({ ok: true, data: grouped() });
});
afterEach(() => { vi.restoreAllMocks(); center.mockClear(); drop.mockClear(); });
function show(permissions = makeUser().permissions) {
  return render(<LanguageProvider><MockAuthProvider user={makeUser({ permissions })}><RelationshipEditor /></MockAuthProvider></LanguageProvider>);
}
async function add(name: string) {
  const enter = screen.queryByRole("button", { name: "Entrar en modo edici\u00f3n" });
  if (enter) await userEvent.click(enter);
  await userEvent.click(await within(screen.getByRole("complementary", { name: "Cat\u00e1logo de activos" })).findByRole("button", { name: new RegExp(name) }));
}
const canvas = () => within(screen.getByTestId("canvas"));

it("starts empty, adds unique assets without writing, and focuses an existing node", async () => {
  const create = vi.spyOn(relationships, "createRelationship");
  show();
  expect(canvas().queryAllByRole("button")).toHaveLength(0);
  await add("api"); await add("api");
  expect(canvas().getAllByRole("button")).toHaveLength(1);
  expect(center).toHaveBeenCalledWith("a");
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver activo" })).toHaveAttribute("target", "_blank");
});

it("searches the bounded asset catalog", async () => {
  show();
  await userEvent.type(screen.getByRole("searchbox"), "database");
  await waitFor(() => expect(assets.listAssets).toHaveBeenLastCalledWith({ q: "database", page: 1, pageSize: 30 }));
});

it("loads canonical neighbors and opens an edge in the workspace", async () => {
  vi.mocked(relationships.getAssetRelationships).mockResolvedValue({ ok: true, data: grouped([relation]) });
  show(); await add("api");
  expect(canvas().queryByRole("button", { name: "database" })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Cargar vecinos" }));
  expect(canvas().getByRole("button", { name: "database" })).toBeInTheDocument();
  await userEvent.click(canvas().getByRole("button", { name: "r1:uses:a:b" }));
  expect(screen.getByRole("button", { name: "Editar relaci\u00f3n" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

async function startCreate() {
  show(); await add("api"); await add("database");
  await userEvent.click(canvas().getByRole("button", { name: "api" }));
  await userEvent.click(screen.getByRole("button", { name: "Crear relaci\u00f3n" }));
  await userEvent.click(canvas().getByRole("button", { name: "database" }));
}
it("creates from selected endpoints with an inline form and a canonical history boundary", async () => {
  const create = vi.spyOn(relationships, "createRelationship").mockResolvedValue({ ok: true, data: relation });
  await startCreate();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Tipo de relaci\u00f3n"), "uses");
  await userEvent.type(screen.getByLabelText("Descripci\u00f3n (opcional)"), "  New description  ");
  await userEvent.click(screen.getByRole("button", { name: "Crear relaci\u00f3n" }));
  expect(create).toHaveBeenCalledWith({ source_asset_id: "a", target_asset_id: "b", relationship_type: "uses", description: "New description" });
  expect(canvas().getByRole("button", { name: "r1:uses:a:b" })).toBeInTheDocument();
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "1");
});

it("keeps rejected creation contextual and does not add an edge", async () => {
  vi.spyOn(relationships, "createRelationship").mockResolvedValue({ ok: false, error: { kind: "duplicate" } });
  await startCreate();
  await userEvent.click(screen.getByRole("button", { name: "Crear relaci\u00f3n" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(canvas().getAllByRole("button")).toHaveLength(2);
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "0");
});

it("edits type and description inline, then deletes only after confirmation", async () => {
  vi.mocked(relationships.getAssetRelationships).mockResolvedValue({ ok: true, data: grouped([relation]) });
  const update = vi.spyOn(relationships, "updateRelationship").mockResolvedValue({ ok: true, data: { ...relation, relationship_type: "hosts", description: "Changed" } });
  const remove = vi.spyOn(relationships, "deleteRelationship").mockResolvedValue({ ok: true, data: null });
  show(); await add("api");
  await userEvent.click(await screen.findByRole("button", { name: "Cargar vecinos" }));
  await userEvent.click(canvas().getByRole("button", { name: "r1:uses:a:b" }));
  await userEvent.click(screen.getByRole("button", { name: "Editar relaci\u00f3n" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Tipo de relaci\u00f3n"), "hosts");
  await userEvent.clear(screen.getByLabelText("Descripci\u00f3n (opcional)"));
  await userEvent.type(screen.getByLabelText("Descripci\u00f3n (opcional)"), "Changed");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(update).toHaveBeenCalledWith("r1", { relationship_type: "hosts", description: "Changed" });
  expect(canvas().getByRole("button", { name: "r1:hosts:a:b" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Eliminar relaci\u00f3n" }));
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar relaci\u00f3n" }));
  expect(remove).toHaveBeenCalledWith("r1");
  expect(canvas().queryByRole("button", { name: /r1:/ })).not.toBeInTheDocument();
  expect(canvas().getAllByRole("button")).toHaveLength(2);
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "2");
});

it("keeps relationship readers read-only", async () => {
  vi.mocked(relationships.getAssetRelationships).mockResolvedValue({ ok: true, data: grouped([relation]) });
  show(["assets.read", "relationships.read"]); await add("api");
  expect(screen.queryByRole("button", { name: "Crear relaci\u00f3n" })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Cargar vecinos" }));
  await userEvent.click(canvas().getByRole("button", { name: "r1:uses:a:b" }));
  expect(screen.queryByRole("button", { name: "Editar relaci\u00f3n" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Eliminar relaci\u00f3n" })).not.toBeInTheDocument();
});

it("preserves relationship-only access using authorized endpoint summaries", async () => {
  const list = vi.spyOn(relationships, "listRelationships").mockResolvedValue({ ok: true, data: { items: [relation], page: 1, page_size: 30, total: 1, total_pages: 1 } });
  show(["relationships.read"]);
  await add("api");
  expect(list).toHaveBeenCalled();
  expect(canvas().getByRole("button", { name: "api" })).toBeInTheDocument();
  expect(assets.listAssets).not.toHaveBeenCalled();
});

function transfer() {
  const values = new Map<string, string>();
  return { effectAllowed: "", dropEffect: "", setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? "" };
}
it("drags only catalog assets into the canvas without creating relationships", async () => {
  const create = vi.spyOn(relationships, "createRelationship");
  show();
  await userEvent.click(screen.getByRole("button", { name: "Entrar en modo edici\u00f3n" }));
  const catalog = screen.getByRole("complementary", { name: "Cat\u00e1logo de activos" });
  const row = await within(catalog).findByRole("button", { name: /api/ });
  expect(row).toHaveAttribute("draggable", "true");
  const dataTransfer = transfer();
  fireEvent.dragStart(row, { dataTransfer });
  fireEvent.dragOver(screen.getByTestId("canvas"), { dataTransfer });
  fireEvent.drop(screen.getByTestId("canvas"), { dataTransfer });
  expect(drop).toHaveBeenCalledWith(expect.objectContaining({ id: "a", is_root: false }), expect.any(Object));
  expect(create).not.toHaveBeenCalled();
  drop.mockClear();
  fireEvent.drop(screen.getByTestId("canvas"), { dataTransfer });
  expect(drop).not.toHaveBeenCalled();
});

it("drag-connect confirms the original source/target and persists only on save", async () => {
  const create = vi.spyOn(relationships, "createRelationship").mockResolvedValue({ ok: true, data: relation });
  show(); await add("api"); await add("database");
  act(() => connect?.({ source: "a", target: "b", sourceHandle: null, targetHandle: null }));
  expect(screen.getByLabelText("Tipo de relaci\u00f3n")).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  expect(canvas().getAllByRole("button")).toHaveLength(2);
  await userEvent.click(within(screen.getByRole("complementary", { name: "Acciones de relaciones" })).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByLabelText("Tipo de relaci\u00f3n")).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  act(() => connect?.({ source: "a", target: "b", sourceHandle: null, targetHandle: null }));
  await userEvent.click(screen.getByRole("button", { name: "Crear relaci\u00f3n" }));
  expect(create).toHaveBeenCalledWith({ source_asset_id: "a", target_asset_id: "b", relationship_type: "depends_on", description: null });
  expect(canvas().getByRole("button", { name: "r1:uses:a:b" })).toBeInTheDocument();
});

it("rejects self/missing endpoints and disables connecting for readers", async () => {
  const rendered = show(); await add("api");
  act(() => connect?.({ source: "a", target: "a", sourceHandle: null, targetHandle: null }));
  act(() => connect?.({ source: "a", target: "missing", sourceHandle: null, targetHandle: null }));
  expect(screen.queryByLabelText("Tipo de relaci\u00f3n")).not.toBeInTheDocument();
  rendered.unmount();
  show(["assets.read", "relationships.read"]);
  expect(connect).toBeUndefined();
});

it("starts read-only, removes and clears only visual nodes, exits without losing saved data", async () => {
  const remove = vi.spyOn(relationships, "deleteRelationship");
  show();
  expect(screen.getByText("Modo vista")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Vaciar lienzo" })).not.toBeInTheDocument();
  await add("api"); await add("database");
  await userEvent.click(screen.getByRole("button", { name: "Quitar del lienzo" }));
  expect(canvas().getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Quitar del lienzo" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Vaciar lienzo" }));
  expect(canvas().queryAllByRole("button")).toHaveLength(0);
  await add("api");
  await userEvent.click(screen.getByRole("button", { name: "Salir del modo edici\u00f3n" }));
  expect(canvas().getByRole("button", { name: "api" })).toBeInTheDocument();
  expect(connect).toBeUndefined();
  expect(remove).not.toHaveBeenCalled();
});

it("requires confirmation to discard a nonempty workspace and leaves view mode empty", async () => {
  show(); await add("api");
  await userEvent.click(screen.getByRole("button", { name: "Descartar lienzo y salir" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Las relaciones guardadas se conservan");
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(canvas().getByRole("button", { name: "api" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Descartar lienzo y salir" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Descartar lienzo y salir" }));
  expect(canvas().queryAllByRole("button")).toHaveLength(0);
  expect(screen.getByText("Modo vista")).toBeInTheDocument();
});

function pendingSave() {
  let finish!: (result: Awaited<ReturnType<typeof relationships.createRelationship>>) => void;
  const create = vi.spyOn(relationships, "createRelationship").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  return { create, finish: (result: Awaited<ReturnType<typeof relationships.createRelationship>>) => finish(result) };
}
async function confirmPendingSave() {
  await startCreate();
  await userEvent.click(screen.getByRole("button", { name: "Crear relaci\u00f3n" }));
}
async function resetWorkspace(kind: "clear" | "discard") {
  if (kind === "clear") await userEvent.click(screen.getByRole("button", { name: "Vaciar lienzo" }));
  else {
    await userEvent.click(screen.getByRole("button", { name: "Descartar lienzo y salir" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Descartar lienzo y salir" }));
  }
}
it.each(["clear", "discard"] as const)("does not restore endpoints after %s during a successful pending save", async (kind) => {
  const pending = pendingSave();
  const remove = vi.spyOn(relationships, "deleteRelationship");
  await confirmPendingSave();
  expect(pending.create).toHaveBeenCalledTimes(1);
  await resetWorkspace(kind);
  expect(canvas().queryAllByRole("button")).toHaveLength(0);
  await add("database");
  await act(async () => pending.finish({ ok: true, data: relation }));
  expect(canvas().getAllByRole("button")).toHaveLength(1);
  expect(canvas().getByRole("button", { name: "database" })).toBeInTheDocument();
  expect(canvas().queryByRole("button", { name: /r1:/ })).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Acciones de relaciones" })).toHaveTextContent("database");
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "1");
  expect(remove).not.toHaveBeenCalled();
  expect(pending.create).toHaveBeenCalledTimes(1);
});
it("applies a pending successful save normally when the workspace was not reset", async () => {
  const pending = pendingSave();
  await confirmPendingSave();
  await act(async () => pending.finish({ ok: true, data: relation }));
  expect(canvas().getByRole("button", { name: "r1:uses:a:b" })).toBeInTheDocument();
  expect(canvas().getAllByRole("button")).toHaveLength(3);
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "1");
});
it.each(["clear", "discard"] as const)("ignores a failed old save after %s without affecting the new workspace", async (kind) => {
  const pending = pendingSave();
  await confirmPendingSave();
  await resetWorkspace(kind);
  await add("database");
  await act(async () => pending.finish({ ok: false, error: { kind: "duplicate" } }));
  expect(canvas().getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByTestId("canvas")).toHaveAttribute("data-revision", "0");
  expect(screen.getByRole("button", { name: "Crear relaci\u00f3n" })).toBeEnabled();
});
