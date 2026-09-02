"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Reveal } from "@/components/ui/Reveal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  ChevronDownIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useTranslation } from "@/i18n";
import { INCIDENTS_PAGE_SIZE } from "@/lib/config";
import { subscribeIncidentsChanged } from "@/lib/incidentsRefresh";
import { getAsset } from "@/services/assets";
import { getIncidentSummary, listIncidents, type IncidentSort } from "@/services/incidents";
import {
  ACTIVE_INCIDENT_STATUSES,
  type IncidentPage,
  type IncidentSummary,
} from "@/types/incident";

import { IncidentActiveFilterChips } from "./IncidentActiveFilterChips";
import {
  EMPTY_INCIDENT_FILTERS,
  hasActiveIncidentFilters,
  IncidentFilters,
  type IncidentFilterState,
} from "./IncidentFilters";
import { IncidentKpiRow, type IncidentKpiKey } from "./IncidentKpiRow";
import { IncidentsTable } from "./IncidentsTable";

const SORTS: IncidentSort[] = ["recent", "oldest", "started", "severity"];

function parseParams(params: URLSearchParams): {
  page: number;
  search: string;
  sort: IncidentSort;
  filters: IncidentFilterState;
} {
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const sortRaw = params.get("sort");
  return {
    page,
    search: params.get("q") ?? "",
    sort: SORTS.includes(sortRaw as IncidentSort) ? (sortRaw as IncidentSort) : "recent",
    filters: {
      severity: params.getAll("severity"),
      status: params.getAll("status"),
      priority: params.getAll("priority"),
      assetId: params.get("asset_id") ?? "",
      startedFrom: params.get("from") ?? "",
      startedTo: params.get("to") ?? "",
    },
  };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; data: IncidentPage }
  | { kind: "error" };

function kpiFilters(key: IncidentKpiKey): IncidentFilterState {
  switch (key) {
    case "open":
      return { ...EMPTY_INCIDENT_FILTERS, status: [...ACTIVE_INCIDENT_STATUSES] };
    case "critical":
      return { ...EMPTY_INCIDENT_FILTERS, severity: ["Critical"] };
    case "investigating":
      return { ...EMPTY_INCIDENT_FILTERS, status: ["Investigating"] };
    case "monitoring":
      return { ...EMPTY_INCIDENT_FILTERS, status: ["Monitoring"] };
    case "resolvedRecently":
      return { ...EMPTY_INCIDENT_FILTERS, status: ["Resolved", "Closed"] };
  }
}

function sameFilters(a: IncidentFilterState, b: IncidentFilterState): boolean {
  const eq = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return (
    eq(a.severity, b.severity) &&
    eq(a.status, b.status) &&
    eq(a.priority, b.priority) &&
    a.assetId === b.assetId &&
    a.startedFrom === b.startedFrom &&
    a.startedTo === b.startedTo
  );
}

function activeKpiKey(filters: IncidentFilterState): IncidentKpiKey | null {
  const keys: IncidentKpiKey[] = [
    "open",
    "critical",
    "investigating",
    "monitoring",
    "resolvedRecently",
  ];
  return keys.find((k) => sameFilters(filters, kpiFilters(k))) ?? null;
}

export function IncidentsBrowser() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => parseParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [filters, setFilters] = useState<IncidentFilterState>(initial.filters);
  const [sort, setSort] = useState<IncidentSort>(initial.sort);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [assetName, setAssetName] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const firstRun = useRef(true);

  useEffect(
    () =>
      subscribeIncidentsChanged(({ focusId }) => {
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

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (firstRun.current) return;
    setPage(1);
  }, [debouncedSearch, filters, sort]);

  // Keep the URL in sync (shareable / back-forward friendly).
  useEffect(() => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    for (const s of filters.severity) qs.append("severity", s);
    for (const s of filters.status) qs.append("status", s);
    for (const p of filters.priority) qs.append("priority", p);
    if (filters.assetId) qs.set("asset_id", filters.assetId);
    if (filters.startedFrom) qs.set("from", filters.startedFrom);
    if (filters.startedTo) qs.set("to", filters.startedTo);
    if (sort !== "recent") qs.set("sort", sort);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [page, debouncedSearch, filters, sort, pathname, router]);

  // Fetch the list.
  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.kind === "loaded" ? s : { kind: "loading" }));
    void listIncidents({
      page,
      pageSize: INCIDENTS_PAGE_SIZE,
      q: debouncedSearch,
      severity: filters.severity,
      status: filters.status,
      priority: filters.priority,
      assetId: filters.assetId || undefined,
      startedFrom: filters.startedFrom
        ? new Date(`${filters.startedFrom}T00:00:00`).toISOString()
        : undefined,
      startedTo: filters.startedTo
        ? new Date(`${filters.startedTo}T23:59:59`).toISOString()
        : undefined,
      sort,
    }).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { kind: "loaded", data: result.data } : { kind: "error" });
    });
    firstRun.current = false;
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, filters, sort, reloadKey]);

  // Fetch the compact operational summary.
  useEffect(() => {
    let cancelled = false;
    void getIncidentSummary().then((res) => {
      if (!cancelled) setSummary(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Resolve the affected-asset name for its filter chip.
  useEffect(() => {
    if (!filters.assetId) {
      setAssetName(undefined);
      return;
    }
    let cancelled = false;
    void getAsset(filters.assetId).then((res) => {
      if (!cancelled) setAssetName(res.ok ? res.data.name : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [filters.assetId]);

  const resetAll = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY_INCIDENT_FILTERS);
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
  }, []);

  const onKpiSelect = useCallback(
    (key: IncidentKpiKey) => {
      setSearch("");
      setDebouncedSearch("");
      setFilters((current) =>
        activeKpiKey(current) === key ? EMPTY_INCIDENT_FILTERS : kpiFilters(key),
      );
    },
    [],
  );

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersActive = hasActiveIncidentFilters(filters) || debouncedSearch.trim() !== "";
  const activeCount =
    filters.severity.length +
    filters.status.length +
    filters.priority.length +
    (filters.assetId ? 1 : 0) +
    (filters.startedFrom ? 1 : 0) +
    (filters.startedTo ? 1 : 0) +
    (debouncedSearch.trim() ? 1 : 0);
  const total = state.kind === "loaded" ? state.data.total : null;

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <PageHeader
          title="Incidents"
          description={t("incidents.subtitle")}
          actions={
            <Link href="/incidents/new" className={buttonClasses({ size: "sm" })}>
              <PlusIcon />
              {t("incidents.newIncident")}
            </Link>
          }
        />
      </Reveal>

      {summary ? (
        <Reveal delayMs={40}>
          <IncidentKpiRow
            summary={summary}
            activeKey={activeKpiKey(filters)}
            onSelect={onKpiSelect}
          />
        </Reveal>
      ) : null}

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
            <div className="flex items-center gap-3">
              <Select
                label={t("incidents.sortLabel")}
                hideLabel
                value={sort}
                onChange={(e) => setSort(e.target.value as IncidentSort)}
                className="py-1.5 text-xs"
                options={[
                  { value: "recent", label: t("incidents.sortRecent") },
                  { value: "oldest", label: t("incidents.sortOldest") },
                  { value: "started", label: t("incidents.sortStarted") },
                  { value: "severity", label: t("incidents.sortSeverity") },
                ]}
              />
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetAll}
                  className="shrink-0 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t("filters.reset")}
                </button>
              ) : null}
            </div>
          </div>

          <Input
            label={t("incidents.searchLabel")}
            hideLabel
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("incidents.searchPlaceholder")}
            autoComplete="off"
            trailing={<SearchIcon className="text-muted-foreground" />}
          />

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
            <IncidentFilters value={filters} onChange={setFilters} />
          </div>

          <IncidentActiveFilterChips
            search={debouncedSearch}
            filters={filters}
            assetName={assetName}
            onSearchClear={clearSearch}
            onChange={setFilters}
            onClearAll={resetAll}
          />
        </Card>
      </Reveal>

      {total !== null ? (
        <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
          {total === 1 ? t("incidents.countOne") : t("incidents.count", { count: total })}
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner decorative />
          {t("incidents.loading")}
        </div>
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("incidents.loadErrorTitle")}</p>
          <p className="mt-0.5">{t("incidents.loadErrorBody")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("incidents.retry")}
          </Button>
        </Alert>
      ) : state.data.items.length === 0 ? (
        <EmptyState
          icon={<ShieldIcon />}
          title={filtersActive ? t("incidents.emptyFilteredTitle") : t("incidents.emptyTitle")}
          description={
            filtersActive ? t("incidents.emptyFilteredBody") : t("incidents.emptyBody")
          }
          action={
            filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                {t("filters.reset")}
              </Button>
            ) : (
              <Link href="/incidents/new" className={buttonClasses({ size: "sm" })}>
                <PlusIcon />
                {t("incidents.emptyCta")}
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4 motion-safe:animate-fade-in">
          <IncidentsTable
            incidents={state.data.items}
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
