"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { AssetTypeIcon } from "@/components/topology/AssetTypeIcon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import { listAssets } from "@/services/assets";
import type { AssetType, Environment, Criticality, AssetStatus } from "@/types/asset";
import type { AssetSummary } from "@/types/relationship";
import { listRelationships } from "@/services/relationships";

export function RelationshipAssetCatalog({ onAdd, visibleIds, onAssetDragStart, onAssetDragEnd }: {
  onAssetDragStart?: (asset: AssetSummary, event: DragEvent<HTMLButtonElement>) => void;
  onAssetDragEnd?: () => void; onAdd: (asset: AssetSummary) => void; visibleIds: Set<string> }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const allowed = can("assets.read");
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState({ q: "", page: 1 });
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setRequest({ q: query.trim(), page: 1 }), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    async function load() {
      if (allowed) {
        const result = await listAssets({ q: request.q, page: request.page, pageSize: 30 });
        return result.ok ? { ok: true as const, items: result.data.items, more: result.data.page < result.data.total_pages } : { ok: false as const };
      }
      // Relationship readers may see endpoint summaries through their existing API,
      // but never query the broader inventory without assets.read.
      const result = await listRelationships({ search: request.q, page: request.page, pageSize: 30 });
      return result.ok ? { ok: true as const, items: [...new Map(result.data.items.flatMap((relationship) => [relationship.source, relationship.target]).map((asset) => [asset.id, asset])).values()], more: result.data.page < result.data.total_pages } : { ok: false as const };
    }
    void load().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) { setError(true); return; }
      setHasMore(result.more);
      setItems((previous) => request.page === 1 ? result.items : [...previous, ...result.items.filter((asset) => !previous.some((item) => item.id === asset.id))]);
    });
    return () => { cancelled = true; };
  }, [request, allowed]);
  return <aside aria-label={t("relationshipEditor.catalog")} className="flex min-h-0 flex-col border-b border-border bg-surface md:border-b-0 md:border-r">
    <div className="space-y-3 p-3">
      <h2 className="text-sm font-semibold">{t("relationshipEditor.catalog")}</h2>
      {<Input type="search" label={t("relationships.picker.searchLabel")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("relationships.picker.searchPlaceholder")} />}
      {!allowed ? <p className="text-xs text-muted-foreground">{t("relationshipEditor.catalogPermission")}</p> : null}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={loading}>
      {items.map((asset) => <button key={asset.id} type="button" draggable={Boolean(onAssetDragStart)} onDragStart={(event) => onAssetDragStart?.(asset, event)} onDragEnd={onAssetDragEnd} onClick={() => onAdd(asset)} aria-pressed={visibleIds.has(asset.id)} className="mb-1 flex w-full items-start gap-2 rounded-lg border border-transparent p-2 text-left hover:bg-muted focus-visible:outline-primary aria-pressed:border-primary/30 aria-pressed:bg-primary/5">
        <span className="mt-1 text-muted-foreground"><AssetTypeIcon type={asset.asset_type} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate font-mono text-xs font-semibold">{asset.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{assetTypeLabel(t, asset.asset_type as AssetType)} / {environmentLabel(t, asset.environment as Environment)}</span>
          <span className="mt-1 flex flex-wrap gap-1"><CriticalityBadge value={asset.criticality as Criticality} /><AssetStatusBadge value={asset.status as AssetStatus} /></span>
        </span>
      </button>)}
      {error ? <p role="alert" className="p-2 text-sm">{t("relationships.picker.loadError")}</p> : null}
      {!loading && !error && !items.length ? <p className="p-2 text-sm text-muted-foreground">{t("relationships.picker.empty")}</p> : null}
      {(error || hasMore) ? <Button variant="ghost" size="sm" disabled={loading} onClick={() => setRequest((previous) => ({ ...previous, page: error ? previous.page : previous.page + 1 }))}>{t(error ? "common.retry" : "relationships.picker.showMore")}</Button> : null}
    </div>
  </aside>;
}
