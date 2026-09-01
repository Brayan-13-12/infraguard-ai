"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import { BoxIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Alert } from "@/components/ui/Alert";
import { useTranslation } from "@/i18n";
import { ASSETS_PAGE_SIZE } from "@/lib/config";
import { listAssets } from "@/services/assets";
import type { AssetPage } from "@/types/asset";

import {
  AssetFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  type AssetActivityFilter,
  type AssetFilterState,
} from "./AssetFilters";
import { AssetsTable } from "./AssetsTable";

function parseParams(params: URLSearchParams): {
  page: number;
  search: string;
  filters: AssetFilterState;
} {
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const state = params.get("state");
  return {
    page,
    search: params.get("q") ?? "",
    filters: {
      assetType: params.get("type") ?? "",
      environment: params.get("environment") ?? "",
      criticality: params.get("criticality") ?? "",
      status: params.get("status") ?? "",
      state: state === "active" || state === "inactive" ? (state as AssetActivityFilter) : "",
    },
  };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; data: AssetPage }
  | { kind: "error" };

export function AssetsBrowser() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => parseParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [filters, setFilters] = useState<AssetFilterState>(initial.filters);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const firstRun = useRef(true);

  // Debounce the search box.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  // Any filter / search change resets to the first page (but not on first mount).
  useEffect(() => {
    if (firstRun.current) return;
    setPage(1);
  }, [debouncedSearch, filters]);

  // Keep the URL in sync (shareable / back-forward friendly).
  useEffect(() => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    if (filters.assetType) qs.set("type", filters.assetType);
    if (filters.environment) qs.set("environment", filters.environment);
    if (filters.criticality) qs.set("criticality", filters.criticality);
    if (filters.status) qs.set("status", filters.status);
    if (filters.state) qs.set("state", filters.state);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [page, debouncedSearch, filters, pathname, router]);

  // Fetch.
  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.kind === "loaded" ? s : { kind: "loading" }));
    void listAssets({
      page,
      pageSize: ASSETS_PAGE_SIZE,
      q: debouncedSearch,
      assetType: filters.assetType,
      environment: filters.environment,
      criticality: filters.criticality,
      status: filters.status,
      isActive:
        filters.state === "active" ? true : filters.state === "inactive" ? false : undefined,
    }).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { kind: "loaded", data: result.data } : { kind: "error" });
    });
    firstRun.current = false;
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, filters, reloadKey]);

  const resetAll = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const filtersActive = hasActiveFilters(filters) || debouncedSearch.trim() !== "";
  const total = state.kind === "loaded" ? state.data.total : null;

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <PageHeader
          title="Assets"
          description={t("assets.subtitle")}
          actions={
            <Link href="/assets/new" className={buttonClasses({ size: "sm" })}>
              <PlusIcon />
              {t("assets.newAsset")}
            </Link>
          }
        />
      </Reveal>

      <Reveal delayMs={60} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label={t("assets.searchLabel")}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("assets.searchPlaceholder")}
              autoComplete="off"
              trailing={<SearchIcon className="text-muted-foreground" />}
            />
          </div>
          {filtersActive ? (
            <Button variant="secondary" onClick={resetAll} className="shrink-0">
              {t("filters.reset")}
            </Button>
          ) : null}
        </div>

        <AssetFilters value={filters} onChange={setFilters} />

        {total !== null ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {total === 1 ? t("assets.countOne") : t("assets.count", { count: total })}
          </p>
        ) : null}
      </Reveal>

      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner decorative />
          {t("assets.loading")}
        </div>
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("assets.loadErrorTitle")}</p>
          <p className="mt-0.5">{t("assets.loadErrorBody")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("assets.retry")}
          </Button>
        </Alert>
      ) : state.data.items.length === 0 ? (
        <EmptyState
          icon={<BoxIcon />}
          title={filtersActive ? t("assets.emptyFilteredTitle") : t("assets.emptyTitle")}
          description={filtersActive ? t("assets.emptyFilteredBody") : t("assets.emptyBody")}
          action={
            filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                {t("filters.reset")}
              </Button>
            ) : (
              <Link href="/assets/new" className={buttonClasses({ size: "sm" })}>
                <PlusIcon />
                {t("assets.emptyCta")}
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4 motion-safe:animate-fade-in">
          <AssetsTable assets={state.data.items} />
          <Pagination
            page={state.data.page}
            pageSize={state.data.page_size}
            total={state.data.total}
            totalPages={state.data.total_pages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
