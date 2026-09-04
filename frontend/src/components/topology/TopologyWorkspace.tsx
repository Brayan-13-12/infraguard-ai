"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { relationshipTypeLabel } from "@/components/assets/relationships/catalog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/overlay";
import { AlertTriangleIcon, ListIcon, MaximizeIcon, RefreshIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { getAssetRelationships } from "@/services/relationships";
import { getSubgraph } from "@/services/topology";
import type { RelationshipDetail, RelationshipType } from "@/types/relationship";
import type { SubgraphResponse, TopologyEdge, TopologyNode } from "@/types/topology";

import { EdgeInspector } from "./EdgeInspector";
import { EmptyTopology } from "./EmptyTopology";
import { NodeInspector } from "./NodeInspector";
import { TopologyCanvas, type TopologyCanvasHandle } from "./TopologyCanvas";
import { EMPTY_FILTERS, TopologyFilters, type TopologyFilterState } from "./TopologyFilters";
import { TopologyList } from "./TopologyList";
import { TopologySearch } from "./TopologySearch";

type State =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_found" }
  | { kind: "ready"; data: SubgraphResponse };

function mergeSubgraphs(base: SubgraphResponse, extra: SubgraphResponse): SubgraphResponse {
  const nodes = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of extra.nodes) nodes.set(n.id, n);
  const edges = new Map(base.edges.map((e) => [e.id, e]));
  for (const e of extra.edges) edges.set(e.id, e);
  return {
    ...base,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    truncated: base.truncated || extra.truncated,
  };
}

export function TopologyWorkspace() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialAssetId = params.get("asset_id");
  const [focusId, setFocusId] = useState<string | null>(initialAssetId);
  const [filters, setFilters] = useState<TopologyFilterState>(EMPTY_FILTERS);
  const [state, setState] = useState<State>(initialAssetId ? { kind: "loading" } : { kind: "empty" });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [listView, setListView] = useState(false);
  const [inspectorOpenMobile, setInspectorOpenMobile] = useState(false);
  const canvasRef = useRef<TopologyCanvasHandle>(null);

  const fetchRoot = useCallback(
    (assetId: string, currentFilters: TopologyFilterState) => {
      setState({ kind: "loading" });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      void getSubgraph({
        rootAssetId: assetId,
        depth: currentFilters.depth,
        direction: currentFilters.direction,
        relationshipType: currentFilters.relationshipType
          ? [currentFilters.relationshipType as RelationshipType]
          : undefined,
        environment: currentFilters.environment || undefined,
        criticality: currentFilters.criticality || undefined,
        status: currentFilters.status || undefined,
      }).then((res) => {
        if (!res.ok) {
          setState(res.error.kind === "not_found" ? { kind: "not_found" } : { kind: "error" });
          return;
        }
        setState({ kind: "ready", data: res.data });
      });
    },
    [],
  );

  useEffect(() => {
    if (focusId) fetchRoot(focusId, filters);
    else setState({ kind: "empty" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, filters]);

  const setUrlAsset = useCallback(
    (assetId: string | null) => {
      const qs = new URLSearchParams(params.toString());
      if (assetId) qs.set("asset_id", assetId);
      else qs.delete("asset_id");
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const focusAsset = useCallback(
    (assetId: string) => {
      setFocusId(assetId);
      setUrlAsset(assetId);
    },
    [setUrlAsset],
  );

  const expandNeighbors = useCallback(
    (assetId: string) => {
      if (state.kind !== "ready") return;
      void getSubgraph({ rootAssetId: assetId, depth: 1, direction: "both", nodeCap: 60 }).then(
        (res) => {
          if (!res.ok) return;
          setState((prev) =>
            prev.kind === "ready" ? { kind: "ready", data: mergeSubgraphs(prev.data, res.data) } : prev,
          );
        },
      );
    },
    [state.kind],
  );

  const typeLabel = useCallback(
    (type: string) => relationshipTypeLabel(t, type as RelationshipType),
    [t],
  );

  const selectedNode: TopologyNode | null =
    state.kind === "ready" ? state.data.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedEdge: TopologyEdge | null =
    state.kind === "ready" ? state.data.edges.find((e) => e.id === selectedEdgeId) ?? null : null;

  // The edge inspector needs the full RelationshipDetail (with both endpoint
  // Assets), not just the bounded topology edge shape - fetched on demand.
  const [selectedEdgeDetail, setSelectedEdgeDetail] = useState<RelationshipDetail | undefined>();
  useEffect(() => {
    if (!selectedEdge) {
      setSelectedEdgeDetail(undefined);
      return;
    }
    void getAssetRelationships(selectedEdge.source_asset_id).then((res) => {
      if (!res.ok) return;
      const found = [...res.data.outgoing, ...res.data.incoming].find(
        (r) => r.id === selectedEdge.id,
      );
      setSelectedEdgeDetail(found);
    });
  }, [selectedEdge]);

  useEffect(() => {
    setInspectorOpenMobile(Boolean(selectedNodeId || selectedEdgeId));
  }, [selectedNodeId, selectedEdgeId]);

  const counts = useMemo(() => {
    if (!selectedNodeId || state.kind !== "ready") return { incoming: 0, outgoing: 0 };
    const incoming = state.data.edges.filter((e) => e.target_asset_id === selectedNodeId).length;
    const outgoing = state.data.edges.filter((e) => e.source_asset_id === selectedNodeId).length;
    return { incoming, outgoing };
  }, [selectedNodeId, state]);

  const inspector =
    selectedNode ? (
      <NodeInspector
        node={selectedNode}
        incomingCount={counts.incoming}
        outgoingCount={counts.outgoing}
        onFocus={() => focusAsset(selectedNode.id)}
        onExpand={() => expandNeighbors(selectedNode.id)}
      />
    ) : selectedEdgeDetail ? (
      <EdgeInspector
        relationship={selectedEdgeDetail}
        onChanged={() => {
          if (focusId) fetchRoot(focusId, filters);
        }}
        onDeleted={() => {
          setSelectedEdgeId(null);
          if (focusId) fetchRoot(focusId, filters);
        }}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("topology.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("topology.subtitle")}</p>
        </div>
        <TopologySearch onSelect={(a) => focusAsset(a.id)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TopologyFilters value={filters} onChange={setFilters} />
          <Button variant="ghost" size="sm" onClick={() => canvasRef.current?.fitView()}>
            <MaximizeIcon className="h-4 w-4" />
            {t("topology.toolbar.fit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => canvasRef.current?.resetView()}>
            <RefreshIcon className="h-4 w-4" />
            {t("topology.toolbar.reset")}
          </Button>
        </div>
        <Button
          variant={listView ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setListView((v) => !v)}
          aria-pressed={listView}
        >
          <ListIcon className="h-4 w-4" />
          {t("topology.toolbar.listView")}
        </Button>
      </div>

      {state.kind === "ready" && state.data.truncated ? (
        <Alert tone="warning">
          <AlertTriangleIcon className="h-4 w-4" />
          {t("topology.truncatedWarning")}
        </Alert>
      ) : null}

      <div className="flex overflow-hidden rounded-xl border border-border bg-background h-[calc(100dvh-16rem)] min-h-[28rem] sm:h-[calc(100dvh-14rem)]">
        <div className="relative min-w-0 flex-1">
          {state.kind === "empty" ? (
            <EmptyTopology kind="no-focus" onSelect={(a) => focusAsset(a.id)} />
          ) : state.kind === "loading" ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : state.kind === "not_found" ? (
            <EmptyTopology kind="not-found" onSelect={(a) => focusAsset(a.id)} />
          ) : state.kind === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">{t("topology.loadError")}</p>
              <Button variant="secondary" size="sm" onClick={() => focusId && fetchRoot(focusId, filters)}>
                {t("common.retry")}
              </Button>
            </div>
          ) : state.data.nodes.length === 0 ? (
            <EmptyTopology kind="no-relationships" onSelect={(a) => focusAsset(a.id)} />
          ) : listView ? (
            <TopologyList
              data={state.data}
              selectedNodeId={selectedNodeId}
              onSelect={(id) => {
                setSelectedNodeId(id);
                setSelectedEdgeId(null);
              }}
              typeLabel={typeLabel}
            />
          ) : (
            <TopologyCanvas
              ref={canvasRef}
              data={state.data}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onNodeSelect={(id) => {
                setSelectedNodeId(id);
                setSelectedEdgeId(null);
              }}
              onEdgeSelect={(id) => {
                setSelectedEdgeId(id);
                setSelectedNodeId(null);
              }}
              typeLabel={typeLabel}
            />
          )}
        </div>

        {inspector ? (
          <aside
            className={cn(
              "hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface lg:block",
            )}
          >
            {inspector}
          </aside>
        ) : null}
      </div>

      <Drawer
        open={inspectorOpenMobile && inspector !== null}
        onClose={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
        side="bottom"
        label={t("topology.inspector.title")}
        className="lg:hidden"
      >
        {inspector}
      </Drawer>
    </div>
  );
}
