"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { AskAiButton } from "@/components/ai/AskAiButton";
import { AddRelationshipDialog } from "@/components/assets/relationships/AddRelationshipDialog";
import { relationshipTypeLabel } from "@/components/assets/relationships/catalog";
import { EdgeInspector } from "@/components/topology/EdgeInspector";
import { TopologyCanvas, type TopologyCanvasHandle } from "@/components/topology/TopologyCanvas";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/Alert";
import { useTranslation } from "@/i18n";
import { getAsset } from "@/services/assets";
import { getAssetRelationships } from "@/services/relationships";
import type { RelationshipDetail, RelationshipType } from "@/types/relationship";
import type { SubgraphResponse, TopologyNode } from "@/types/topology";
import { RelationshipAssetCatalog } from "./RelationshipAssetCatalog";

const EMPTY: SubgraphResponse = { root_asset_id: "", nodes: [], edges: [], depth: 1, direction: "both", truncated: false, source: "postgres" };
type Endpoint = Omit<TopologyNode, "is_root">;
const asNode = (asset: Endpoint): TopologyNode => ({ ...asset, is_root: false });

export function RelationshipEditor({ initialAssetId }: { initialAssetId?: string | null }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("relationships.manage");
  const [editMode, setEditMode] = useState(false);
  const editing = editMode && canManage;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [session, setSession] = useState(0);
  const workspaceGeneration = useRef(0);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const canReadAssets = can("assets.read");
  const [graph, setGraph] = useState<SubgraphResponse>(EMPTY);
  const [revision, setRevision] = useState(0);
  const mutationVersion = useRef(0);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RelationshipDetail>>({});
  const [connections, setConnections] = useState<RelationshipDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<TopologyNode | null>(null);
  const [target, setTarget] = useState<TopologyNode | null>(null);
  const draggedAsset = useRef<Endpoint | null>(null);
  const canvas = useRef<TopologyCanvasHandle>(null);
  const selected = graph.nodes.find((node) => node.id === nodeId);
  const visibleIds = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph.nodes]);
  const label = useCallback((type: string) => relationshipTypeLabel(t, type as RelationshipType), [t]);
  function cancel() { setSource(null); setTarget(null); }
  function exit() { cancel(); draggedAsset.current = null; setEditMode(false); }
  function discard() {
    mutationVersion.current += 1;
    setGraph(EMPTY); setNodeId(null); setEdgeId(null); setConnections([]); setError(null);
    workspaceGeneration.current += 1;
    setWorkspaceEpoch(workspaceGeneration.current);
    setSession(workspaceGeneration.current);
    setDiscardOpen(false); exit();
  }
  function clearCanvas() {
    // Invalidate visual callbacks, without aborting an already-confirmed API write.
    workspaceGeneration.current += 1;
    setWorkspaceEpoch(workspaceGeneration.current);
    cancel(); setGraph({ ...graph, nodes: [], edges: [] }); setNodeId(null); setEdgeId(null);
  }
  function removeSelected() {
    if (!editing || !nodeId) return;
    cancel();
    setGraph((previous) => ({ ...previous, nodes: previous.nodes.filter((node) => node.id !== nodeId), edges: previous.edges.filter((edge) => edge.source_asset_id !== nodeId && edge.target_asset_id !== nodeId) }));
    setNodeId(null); setEdgeId(null);
  }
  useEffect(() => {
    if (nodeId && !graph.nodes.some((node) => node.id === nodeId)) setNodeId(null);
    if (edgeId && !graph.edges.some((edge) => edge.id === edgeId)) setEdgeId(null);
  }, [graph, nodeId, edgeId]);
  useEffect(() => { if (!canManage) { setEditMode(false); setSource(null); setTarget(null); } }, [canManage]);
  useEffect(() => {
    if (source && !visibleIds.has(source.id)) { setSource(null); setTarget(null); }
    if (target && !visibleIds.has(target.id)) setTarget(null);
  }, [visibleIds, source, target]);
  useEffect(() => {
    if (!initialAssetId || !canReadAssets) return;
    let cancelled = false;
    const generation = workspaceGeneration.current;
    void getAsset(initialAssetId).then((result) => {
      if (cancelled || generation !== workspaceGeneration.current) return;
      if (!result.ok) { setError(t("relationships.errors.notFound")); return; }
      setGraph((previous) => ({ ...previous, nodes: [...previous.nodes.filter((node) => node.id !== result.data.id), asNode(result.data)] }));
      setNodeId(result.data.id);
    });
    return () => { cancelled = true; };
  }, [initialAssetId, canReadAssets, t]);
  useEffect(() => {
    setConnections([]);
    if (!nodeId) return;
    let cancelled = false;
    const version = mutationVersion.current;
    setLoading(true); setError(null);
    void getAssetRelationships(nodeId).then((result) => {
      if (cancelled || version !== mutationVersion.current) return;
      setLoading(false);
      if (!result.ok) { setError(t("relationships.loadError")); return; }
      const relationships = [...result.data.outgoing, ...result.data.incoming];
      setConnections(relationships);
      setDetails((previous) => ({ ...previous, ...Object.fromEntries(relationships.map((item) => [item.id, item])) }));
    });
    return () => { cancelled = true; };
  }, [nodeId, revision, t]);
  function add(asset: Endpoint) {
    if (visibleIds.has(asset.id)) canvas.current?.centerNode(asset.id);
    else if (!editing) setGraph({ ...EMPTY, nodes: [asNode(asset)] });
    else setGraph((previous) => previous.nodes.some((node) => node.id === asset.id) ? previous : ({ ...previous, nodes: [...previous.nodes, asNode(asset)] }));
    if (!source) { setNodeId(asset.id); setEdgeId(null); }
  }
  function selectNode(id: string | null) {
    if (!id) { cancel(); setNodeId(null); setEdgeId(null); return; }
    if (source && editing) {
      if (!id) return;
      if (id === source.id) { setError(t("dependencies.create.errorSameAsset")); return; }
      setTarget(graph.nodes.find((node) => node.id === id) ?? null); setError(null);
    } else { setNodeId(id); setEdgeId(null); }
  }
  function loadConnections() {
    setGraph((previous) => {
      const nodes = new Map(previous.nodes.map((node) => [node.id, node]));
      const edges = new Map(previous.edges.map((edge) => [edge.id, edge]));
      for (const relationship of connections) {
        nodes.set(relationship.source.id, asNode(relationship.source));
        nodes.set(relationship.target.id, asNode(relationship.target));
        edges.set(relationship.id, relationship);
      }
      return { ...previous, nodes: [...nodes.values()], edges: [...edges.values()] };
    });
  }
  function saved(relationship: RelationshipDetail) {
    mutationVersion.current += 1;
    const staleWorkspace = workspaceEpoch !== workspaceGeneration.current;
    setDetails((previous) => ({ ...previous, [relationship.id]: relationship }));
    setGraph((previous) => {
      // Reconcile an already-visible edited edge, but never restore a stale
      // save's endpoints or insert its edge into a cleared/new workspace.
      if (staleWorkspace) return { ...previous, edges: previous.edges.map((edge) => edge.id === relationship.id ? relationship : edge) };
      const nodes = new Map(previous.nodes.map((node) => [node.id, node]));
      if (!nodes.has(relationship.source.id)) nodes.set(relationship.source.id, asNode(relationship.source));
      if (!nodes.has(relationship.target.id)) nodes.set(relationship.target.id, asNode(relationship.target));
      return { ...previous, nodes: [...nodes.values()], edges: [...previous.edges.filter((edge) => edge.id !== relationship.id), relationship] };
    });
    // Every successful write invalidates older visual snapshots, including
    // snapshots restored with Undo while the request was in flight.
    setRevision((previous) => previous + 1);
    if (!staleWorkspace) { cancel(); setNodeId(null); setEdgeId(relationship.id); }
  }
  return <div className="space-y-3">
    <div><h1 className="text-xl font-semibold">{t("assetsWorkspace.relations")}</h1><p className="text-sm text-muted-foreground">{t("relationshipEditor.subtitle")}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">{t(editing ? "relationshipEditor.editMode" : "relationshipEditor.viewMode")}</span>
      {canManage && !editing ? <Button size="sm" onClick={() => setEditMode(true)}>{t("relationshipEditor.enterEdit")}</Button> : null}
      {editing ? <>
        <Button variant="secondary" size="sm" onClick={exit}>{t("relationshipEditor.exitEdit")}</Button>
        <Button variant="ghost" size="sm" onClick={() => graph.nodes.length ? setDiscardOpen(true) : discard()}>{t("relationshipEditor.discard")}</Button>
        <p className="text-xs text-muted-foreground">{t("relationshipEditor.savedNotice")}</p>
      </> : null}
    </div>
    <ConfirmDialog open={discardOpen && editing} onClose={() => setDiscardOpen(false)} onConfirm={discard} title={t("relationshipEditor.discard")} description={t("relationshipEditor.discardBody")} confirmLabel={t("relationshipEditor.discard")} />
    {error ? <Alert tone="danger">{error}</Alert> : null}
    <div className="grid h-[calc(100dvh-15rem)] min-h-[52rem] md:min-h-[38rem] grid-rows-[14rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-border md:grid-cols-[17rem_minmax(0,1fr)] md:grid-rows-1">
      <RelationshipAssetCatalog visibleIds={visibleIds} onAdd={add} onAssetDragStart={editing ? (asset, event) => {
        draggedAsset.current = asset;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-infraguard-asset", asset.id);
      } : undefined} onAssetDragEnd={() => { draggedAsset.current = null; }} />
      <section aria-label={t("relationshipEditor.canvas")} className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2">
          <Button variant="ghost" size="sm" onClick={() => canvas.current?.fitView()}>{t("topology.toolbar.fit")}</Button>
          <Button variant="ghost" size="sm" onClick={() => canvas.current?.resetView()}>{t("topology.toolbar.reset")}</Button>
          {editing ? <>
            <Button variant="secondary" size="sm" disabled={!nodeId} onClick={removeSelected}>{t("relationshipEditor.removeNode")}</Button>
            <Button variant="ghost" size="sm" disabled={!graph.nodes.length} onClick={clearCanvas}>{t("relationshipEditor.clearCanvas")}</Button>
          </> : null}
          {source ? <><p role="status" className="min-w-0 flex-1 break-words text-xs">{t("topology.create.chooseTarget", { name: source.name })}</p><Button variant="secondary" size="sm" onClick={cancel}>{t("fieldEdit.cancel")}</Button></> : <span className="text-xs text-muted-foreground">{graph.nodes.length} {t("relationshipEditor.onCanvas")}</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="relative min-h-[16rem] min-w-0 flex-1"
            onDragOver={(event) => {
              if (!editing || !draggedAsset.current) return;
              event.preventDefault(); event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              const asset = draggedAsset.current;
              draggedAsset.current = null;
              if (!editing || !asset || event.dataTransfer.getData("application/x-infraguard-asset") !== asset.id) return;
              event.preventDefault();
              canvas.current?.dropNode(asNode(asset), { x: event.clientX, y: event.clientY });
              // Avoid opening/resizing the inspector at drop time: the pointer position stays exact.
            }}>

            <TopologyCanvas key={session} preservePositions onConnect={editing && !source ? (connection) => {
              const from = graph.nodes.find((node) => node.id === connection.source);
              const to = graph.nodes.find((node) => node.id === connection.target);
              if (!from || !to || from.id === to.id) return;
              setSource(from); setTarget(to); setEdgeId(null); setError(null);
            } : undefined} ref={canvas} data={graph} persistedRevision={revision} selectedNodeId={nodeId} selectedEdgeId={edgeId} typeLabel={label} onNodeSelect={selectNode} onEdgeSelect={(id) => { if (!source) { setEdgeId(id); setNodeId(null); } }} onRestoreData={setGraph} />
            {!graph.nodes.length ? <p className="pointer-events-none absolute inset-x-6 top-1/2 text-center text-sm text-muted-foreground">{t("relationshipEditor.empty")}</p> : null}
          </div>
          {((selected && !source) || edgeId || target) ? <aside aria-label={t("relationshipEditor.selection")} className="max-h-64 shrink-0 overflow-y-auto border-t border-border bg-surface xl:max-h-none xl:w-72 xl:border-l xl:border-t-0">
            {source && target && editing ? <AddRelationshipDialog inline key={`${source.id}-${target.id}`} sourceAsset={source} targetAsset={target} onClose={cancel} onCreated={saved} /> : edgeId && details[edgeId] ? <EdgeInspector readOnly={!editing} key={`${edgeId}-${revision}`} inlineForms relationship={details[edgeId]} onChanged={saved} onDeleted={() => {
              mutationVersion.current += 1;
              setGraph((previous) => ({ ...previous, edges: previous.edges.filter((edge) => edge.id !== edgeId) }));
              setRevision((previous) => previous + 1); setEdgeId((current) => current === edgeId ? null : current);
            }} /> : selected && !source ? <div className="space-y-3 p-3">
              <h2 className="break-words font-mono text-sm font-semibold">{selected.name}</h2>
              <div className="flex flex-wrap gap-2">
                {editing ? <Button size="sm" onClick={() => { setSource(selected); setTarget(null); setError(null); }}>{t("topology.create.action")}</Button> : null}
                <Button variant="secondary" size="sm" disabled={loading || !connections.length} onClick={loadConnections}>{t("relationshipEditor.loadNeighbors")}</Button>
                {canReadAssets ? <a className="text-sm text-primary underline" href={`/assets/${selected.id}`} target="_blank" rel="noopener noreferrer">{t("topology.inspector.viewAsset")}</a> : null}
                <AskAiButton entity={{ type: "asset", id: selected.id }} />
              </div>
              <h3 className="text-xs font-semibold">{t("relationshipEditor.connected")}</h3>
              {loading ? <p role="status" className="text-xs">{t("relationshipEditor.loading")}</p> : !connections.length ? <p className="text-xs text-muted-foreground">{t("relationships.empty")}</p> : connections.map((relationship) => <button key={relationship.id} className="block w-full rounded border border-border p-2 text-left text-xs hover:bg-muted" onClick={() => {
                setGraph((previous) => {
                  const nodes = new Map(previous.nodes.map((node) => [node.id, node]));
                  nodes.set(relationship.source.id, asNode(relationship.source)); nodes.set(relationship.target.id, asNode(relationship.target));
                  return { ...previous, nodes: [...nodes.values()], edges: [...previous.edges.filter((edge) => edge.id !== relationship.id), relationship] };
                });
                setEdgeId(relationship.id); setNodeId(null);
              }}>{relationship.source.name} {"→"} {label(relationship.relationship_type)} {"→"} {relationship.target.name}</button>)}
            </div> : null}
          </aside> : null}
        </div>
      </section>
    </div>
  </div>;
}
