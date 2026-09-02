"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Reveal } from "@/components/ui/Reveal";
import { Spinner } from "@/components/ui/Spinner";
import {
  BoxIcon,
  ChevronDownIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { useTranslation } from "@/i18n";
import { ASSETS_PAGE_SIZE } from "@/lib/config";
import { subscribeAssetsChanged } from "@/lib/assetsRefresh";
import { listAssets } from "@/services/assets";
import type { AssetPage } from "@/types/asset";

import { ActiveFilterChips } from "./ActiveFilterChips";
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
      // Repeatable params: /assets?criticality=Critical&criticality=High
      criticality: params.getAll("criticality"),
      status: params.getAll("status"),
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
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const firstRun = useRef(true);

  // An Asset action in a drawer (create / edit / deactivate) asks the list to
  // refetch; a freshly created asset is briefly highlighted if it lands here.
  useEffect(
    () =>
      subscribeAssetsChanged(({ focusId }) => {
        setReloadKey((k) => k + 1);
        if (focusId) setHighlightId(focusId);
      }),
    [],
  );

  useEffect(() => {
    if (!highlightId) return;
    const id = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(id);
  }, [highlightId]);

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
    for (const c of filters.criticality) qs.append("criticality", c);
    for (const s of filters.status) qs.append("status", s);
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

  const clearSearch = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
  }, []);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersActive = hasActiveFilters(filters) || debouncedSearch.trim() !== "";
  const activeCount =
    (filters.assetType ? 1 : 0) +
    (filters.environment ? 1 : 0) +
    filters.criticality.length +
    filters.status.length +
    (filters.state ? 1 : 0) +
    (debouncedSearch.trim() ? 1 : 0);
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

      <Reveal delayMs={60}>
        <Card className="flex flex-col gap-3.5 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FilterIcon className="h-4 w-4 text-muted-foreground" />
              {t("filters.title")}
              {activeCount > 0 ? (
                <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-primary">
                  {activeCount}
                </span>
              ) : null}
            </span>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetAll}
                className="rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("filters.reset")}
              </button>
            ) : null}
          </div>

          <Input
            label={t("assets.searchLabel")}
            hideLabel
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("assets.searchPlaceholder")}
            autoComplete="off"
            trailing={<SearchIcon className="text-muted-foreground" />}
          />

          {/* Mobile: collapse the select row behind a toggle. */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-expanded={mobileFiltersOpen}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground sm:hidden"
          >
            <span>
              {t("filters.title")}
              {activeCount > 0 ? ` (${activeCount})` : ""}
            </span>
            <ChevronDownIcon
              className={cn("transition-transform", mobileFiltersOpen && "rotate-180")}
            />
          </button>

          <div className={cn("sm:block", mobileFiltersOpen ? "block" : "hidden")}>
            <AssetFilters value={filters} onChange={setFilters} />
          </div>

          <ActiveFilterChips
            search={debouncedSearch}
            filters={filters}
            onSearchClear={clearSearch}
            onChange={setFilters}
            onClearAll={resetAll}
          />
        </Card>
      </Reveal>

      {total !== null ? (
        <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
          {total === 1 ? t("assets.countOne") : t("assets.count", { count: total })}
        </p>
      ) : null}

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
          <AssetsTable
            assets={state.data.items}
            highlightId={highlightId ?? undefined}
          />
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
