"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { listAssets } from "@/services/assets";
import type { Asset, AssetType, Criticality, Environment } from "@/types/asset";

/** Initial batch + increment. Bounded by the backend page-size cap (100). */
const PAGE_SIZE = 20;

/**
 * Searchable, incrementally-loaded **single-select** asset picker for the
 * relationship target - the sibling of {@link IncidentAssetPicker} (which is
 * multi-select). Never loads the whole inventory; excludes the source asset
 * (a relationship cannot point at itself) so it never even appears as a
 * choice, and offers a "Mostrar más" batch instead of one giant list.
 */
export function RelationshipAssetPicker({
  value,
  onChange,
  excludeId,
  disabled = false,
  label,
}: {
  value: Asset | null;
  onChange: (asset: Asset | null) => void;
  /** An asset id to exclude from the results (e.g. the other endpoint already
   * chosen, so a relationship cannot point at itself). */
  excludeId?: string;
  disabled?: boolean;
  /** Overrides the default "Activo destino" label - the global Dependencias
   * module reuses this picker for both endpoints ("Activo origen" too). */
  label?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void listAssets({ q: debounced, page, pageSize: PAGE_SIZE }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setTotal(res.data.total);
      setItems((prev) => {
        const fresh = res.data.items.filter((a) => a.id !== excludeId);
        if (page === 1) return fresh;
        const known = new Set(prev.map((a) => a.id));
        return [...prev, ...fresh.filter((a) => !known.has(a.id))];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, page, excludeId]);

  const hasMore = items.length < total;
  const selectedId = value?.id;

  const visibleItems = useMemo(
    () => items.filter((a) => a.id !== excludeId),
    [items, excludeId],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-sm font-medium text-foreground">
        {label ?? t("relationships.picker.label")}
      </span>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {assetTypeLabel(t, value.asset_type)} · {environmentLabel(t, value.environment)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              inputRef.current?.focus();
            }}
          >
            {t("relationships.picker.change")}
          </Button>
        </div>
      ) : (
        <>
          <Input
            ref={inputRef}
            label={t("relationships.picker.searchLabel")}
            hideLabel
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("relationships.picker.searchPlaceholder")}
            autoComplete="off"
            disabled={disabled}
            trailing={<SearchIcon className="text-muted-foreground" />}
          />

          <div className="rounded-lg border border-border">
            {loadError ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("relationships.picker.loadError")}
              </p>
            ) : visibleItems.length === 0 && !loading ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {debounced
                  ? t("relationships.picker.empty")
                  : t("relationships.picker.emptyInventory")}
              </p>
            ) : (
              <>
                <ul className="max-h-[16rem] overflow-y-auto">
                  {visibleItems.map((a) => {
                    const selected = a.id === selectedId;
                    return (
                      <li key={a.id} className="border-b border-border last:border-0">
                        <button
                          type="button"
                          onClick={() => onChange(a)}
                          disabled={disabled}
                          aria-pressed={selected}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                            selected && "bg-primary/[0.06]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                          >
                            {selected ? <CheckIcon className="h-3 w-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[13px] font-medium text-foreground">
                              {a.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {assetTypeLabel(t, a.asset_type as AssetType)} ·{" "}
                              {environmentLabel(t, a.environment as Environment)}
                            </span>
                          </span>
                          <CriticalityBadge value={a.criticality as Criticality} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasMore ? (
                  <div className="border-t border-border p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      fullWidth
                      loading={loading}
                      disabled={disabled}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("relationships.picker.showMore")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
