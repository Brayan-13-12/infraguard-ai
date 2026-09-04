"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import { SearchIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { listAssets } from "@/services/assets";
import type { Asset } from "@/types/asset";

/**
 * Search by name / hostname / IP (the backend list endpoint already covers
 * all three). Selecting a result focuses/centers that node (§32).
 */
export function TopologySearch({ onSelect }: { onSelect: (asset: Asset) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      void listAssets({ q: term, page: 1, pageSize: 8 }).then((res) => {
        if (cancelled || res.ok === false) return;
        setResults(res.data.items);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <Input
        label={t("topology.search.label")}
        hideLabel
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("topology.search.placeholder")}
        autoComplete="off"
        trailing={<SearchIcon className="text-muted-foreground" />}
      />
      {open && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-md">
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(a);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                )}
              >
                <span className="truncate font-medium text-foreground">{a.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {a.hostname ?? a.environment}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
