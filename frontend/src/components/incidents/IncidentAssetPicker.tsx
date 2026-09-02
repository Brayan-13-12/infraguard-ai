"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckIcon, CloseIcon, SearchIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { listAssets } from "@/services/assets";
import type { Asset, AssetType, Criticality, Environment } from "@/types/asset";

export interface PickerAsset {
  id: string;
  name: string;
  asset_type: string;
  environment: string;
  criticality: string;
}

/** Initial batch + increment. Bounded by the backend page-size cap (100). */
const PAGE_SIZE = 20;

/**
 * Searchable, incrementally-loaded asset picker. It never loads the whole
 * inventory: it opens with a useful batch of {@link PAGE_SIZE} assets and
 * fetches more on demand ("Mostrar más"); each search runs server-side. Selected
 * assets are shown as removable chips above the list and stay visible when the
 * search changes.
 */
export function IncidentAssetPicker({
  value,
  onChange,
  seed = [],
  disabled = false,
  error,
  hideLabel = false,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Known {id,name,…} for already-selected assets. */
  seed?: PickerAsset[];
  disabled?: boolean;
  error?: string;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // id -> display record, populated from seed + every result we have seen, so a
  // selected asset keeps its name even after the search moves on.
  const cache = useRef(new Map<string, PickerAsset>());
  for (const a of seed) if (!cache.current.has(a.id)) cache.current.set(a.id, a);
  for (const a of items) {
    cache.current.set(a.id, {
      id: a.id,
      name: a.name,
      asset_type: a.asset_type,
      environment: a.environment,
      criticality: a.criticality,
    });
  }

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  // A new search resets to the first page.
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
        if (page === 1) return res.data.items;
        const known = new Set(prev.map((a) => a.id));
        return [...prev, ...res.data.items.filter((a) => !known.has(a.id))];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, page]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const hasMore = items.length < total;

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(selectedSet.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const selectedRecords = value.map(
    (id) =>
      cache.current.get(id) ?? {
        id,
        name: id,
        asset_type: "",
        environment: "",
        criticality: "",
      },
  );

  return (
    <div className="flex flex-col gap-2.5">
      {!hideLabel ? (
        <span className="text-sm font-medium text-foreground">
          {t("incidentForm.assetPicker.label")}
        </span>
      ) : null}

      {value.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {value.length === 1
              ? t("incidentForm.assetPicker.selectedOne")
              : t("incidentForm.assetPicker.selected", { count: value.length })}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {selectedRecords.map((a) => (
              <li key={a.id}>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface py-1 pl-2.5 pr-1 text-xs shadow-xs">
                  <span className="font-medium text-foreground">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    disabled={disabled}
                    aria-label={t("incidentForm.assetPicker.remove", { name: a.name })}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("incidentForm.assetPicker.none")}</p>
      )}

      <Input
        label={t("incidentForm.assetPicker.searchLabel")}
        hideLabel
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("incidentForm.assetPicker.searchPlaceholder")}
        autoComplete="off"
        disabled={disabled}
        error={error}
        trailing={<SearchIcon className="text-muted-foreground" />}
      />

      <div className="rounded-lg border border-border">
        {loadError ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("incidentForm.assetPicker.loadError")}
          </p>
        ) : items.length === 0 && !loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {debounced
              ? t("incidentForm.assetPicker.empty")
              : t("incidentForm.assetPicker.emptyInventory")}
          </p>
        ) : (
          <>
            <ul className="max-h-[19rem] overflow-y-auto">
              {items.map((a) => {
                const selected = selectedSet.has(a.id);
                return (
                  <li key={a.id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      disabled={disabled}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        selected && "bg-primary/[0.06]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
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
                  {t("incidentForm.assetPicker.showMore")}
                </Button>
              </div>
            ) : (
              <p className="border-t border-border px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                {t("incidentForm.assetPicker.count", { count: items.length })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
