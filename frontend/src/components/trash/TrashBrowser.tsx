"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  assetTypeOptions,
  criticalityOptions,
} from "@/components/assets/catalog";
import {
  incidentStatusOptions,
  severityOptions,
} from "@/components/incidents/catalog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Reveal } from "@/components/ui/Reveal";
import { Select } from "@/components/ui/Select";
import { Tabs, useTabsId } from "@/components/ui/Tabs";
import { ChevronDownIcon, FilterIcon, SearchIcon, TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { TRASH_ASSETS_PAGE_SIZE, TRASH_INCIDENTS_PAGE_SIZE } from "@/lib/config";
import { subscribeTrashChanged } from "@/lib/trashRefresh";
import {
  getTrashSummary,
  listTrashAssets,
  listTrashIncidents,
} from "@/services/trash";
import type {
  TrashAssetPage,
  TrashIncidentPage,
  TrashSummary,
} from "@/types/trash";

import { TrashAssetsList } from "./TrashAssetsList";
import { TrashIncidentsList } from "./TrashIncidentsList";
import { TrashListSkeleton } from "./TrashListSkeleton";

type Tab = "assets" | "incidents";

interface Filters {
  search: string;
  assetType: string;
  criticality: string;
  severity: string;
  status: string;
  deletedBy: string;
  from: string;
  to: string;
}

const EMPTY: Filters = {
  search: "",
  assetType: "",
  criticality: "",
  severity: "",
  status: "",
  deletedBy: "",
  from: "",
  to: "",
};

function parseParams(p: URLSearchParams): { tab: Tab; page: number; filters: Filters } {
  return {
    tab: p.get("type") === "incidents" ? "incidents" : "assets",
    page: Math.max(1, Number.parseInt(p.get("page") ?? "1", 10) || 1),
    filters: {
      search: p.get("q") ?? "",
      assetType: p.get("asset_type") ?? "",
      criticality: p.get("criticality") ?? "",
      severity: p.get("severity") ?? "",
      status: p.get("status") ?? "",
      deletedBy: p.get("deleted_by") ?? "",
      from: p.get("from") ?? "",
      to: p.get("to") ?? "",
    },
  };
}

function activeFilterCount(tab: Tab, f: Filters): number {
  const common =
    (f.deletedBy.trim() ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0);
  return tab === "assets"
    ? common + (f.assetType ? 1 : 0) + (f.criticality ? 1 : 0)
    : common + (f.severity ? 1 : 0) + (f.status ? 1 : 0);
}

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "loaded"; data: T }
  | { kind: "error" };

function SummaryStrip({ summary, tab }: { summary: TrashSummary; tab: Tab }) {
  const { t } = useTranslation();
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {(
        [
          [t("trash.summary.assets"), summary.assets, "assets"],
          [t("trash.summary.incidents"), summary.incidents, "incidents"],
        ] as const
      ).map(([label, value, key]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <dd
            className={cn(
              "text-sm font-semibold tabular-nums",
              tab === key ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {value}
          </dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function TrashBrowser() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabsId = useTabsId("trash");

  const initial = useMemo(() => parseParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>(initial.tab);
  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.filters.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [filtersOpen, setFiltersOpen] = useState(
    activeFilterCount(initial.tab, initial.filters) > 0,
  );
  const [assets, setAssets] = useState<LoadState<TrashAssetPage>>({ kind: "loading" });
  const [incidents, setIncidents] = useState<LoadState<TrashIncidentPage>>({ kind: "loading" });
  const [summary, setSummary] = useState<TrashSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(
    () => subscribeTrashChanged(() => setReloadKey((k) => k + 1)),
    [],
  );

  const effective = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  // Reset to page 1 whenever the query changes.
  useEffect(() => {
    setPage(1);
  }, [effective, tab]);

  // Sync URL.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (tab === "incidents") qs.set("type", "incidents");
    if (page > 1) qs.set("page", String(page));
    if (effective.search.trim()) qs.set("q", effective.search.trim());
    if (effective.deletedBy.trim()) qs.set("deleted_by", effective.deletedBy.trim());
    if (effective.from) qs.set("from", effective.from);
    if (effective.to) qs.set("to", effective.to);
    if (tab === "assets") {
      if (effective.assetType) qs.set("asset_type", effective.assetType);
      if (effective.criticality) qs.set("criticality", effective.criticality);
    } else {
      if (effective.severity) qs.set("severity", effective.severity);
      if (effective.status) qs.set("status", effective.status);
    }
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [tab, page, effective, pathname, router]);

  // Fetch the active tab's list.
  useEffect(() => {
    let cancelled = false;
    const common = {
      page,
      q: effective.search,
      deletedBy: effective.deletedBy || undefined,
      from: effective.from ? new Date(`${effective.from}T00:00:00`).toISOString() : undefined,
      to: effective.to ? new Date(`${effective.to}T23:59:59`).toISOString() : undefined,
    };
    if (tab === "assets") {
      setAssets({ kind: "loading" });
      void listTrashAssets({
        ...common,
        pageSize: TRASH_ASSETS_PAGE_SIZE,
        type: effective.assetType || undefined,
        criticality: effective.criticality || undefined,
      }).then((res) => {
        if (!cancelled) setAssets(res.ok ? { kind: "loaded", data: res.data } : { kind: "error" });
      });
    } else {
      setIncidents({ kind: "loading" });
      void listTrashIncidents({
        ...common,
        pageSize: TRASH_INCIDENTS_PAGE_SIZE,
        severity: effective.severity || undefined,
        status: effective.status || undefined,
      }).then((res) => {
        if (!cancelled)
          setIncidents(res.ok ? { kind: "loaded", data: res.data } : { kind: "error" });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [tab, page, effective, reloadKey]);

  // Fetch the summary (tab counts + strip).
  useEffect(() => {
    let cancelled = false;
    void getTrashSummary().then((res) => {
      if (!cancelled) setSummary(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const resetAll = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY);
  }, []);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  const filterCount = activeFilterCount(tab, filters);
  const filtersActive = filterCount > 0 || debouncedSearch.trim() !== "";

  const state = tab === "assets" ? assets : incidents;
  const total = state.kind === "loaded" ? state.data.total : null;

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <PageHeader title="Trash" description={t("trash.subtitle")} />
      </Reveal>

      {summary ? (
        <Reveal delayMs={40}>
          <SummaryStrip summary={summary} tab={tab} />
        </Reveal>
      ) : null}

      <Reveal delayMs={60}>
        <Tabs
          idBase={tabsId}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            {
              id: "assets",
              label: t("trash.tabs.assets"),
              badge: summary?.assets,
            },
            {
              id: "incidents",
              label: t("trash.tabs.incidents"),
              badge: summary?.incidents,
            },
          ]}
        />
      </Reveal>

      <Card className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <Input
            label={
              tab === "assets" ? t("trash.searchAssets") : t("trash.searchIncidents")
            }
            hideLabel
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "assets"
                ? t("trash.searchAssetsPlaceholder")
                : t("trash.searchIncidentsPlaceholder")
            }
            autoComplete="off"
            className="flex-1"
            trailing={<SearchIcon className="text-muted-foreground" />}
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              filterCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <FilterIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t("filters.title")}</span>
            {filterCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-1.5 text-[11px] tabular-nums">
                {filterCount}
              </span>
            ) : null}
            <ChevronDownIcon
              className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")}
            />
          </button>
        </div>

        {filtersOpen ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tab === "assets" ? (
                <>
                  <Select
                    label={t("trash.filters.type")}
                    value={filters.assetType}
                    onChange={(e) => set("assetType", e.target.value)}
                    options={[
                      { value: "", label: t("trash.filters.all") },
                      ...assetTypeOptions(t),
                    ]}
                  />
                  <Select
                    label={t("trash.filters.criticality")}
                    value={filters.criticality}
                    onChange={(e) => set("criticality", e.target.value)}
                    options={[
                      { value: "", label: t("trash.filters.all") },
                      ...criticalityOptions(t),
                    ]}
                  />
                </>
              ) : (
                <>
                  <Select
                    label={t("trash.filters.severity")}
                    value={filters.severity}
                    onChange={(e) => set("severity", e.target.value)}
                    options={[
                      { value: "", label: t("trash.filters.all") },
                      ...severityOptions(t),
                    ]}
                  />
                  <Select
                    label={t("trash.filters.status")}
                    value={filters.status}
                    onChange={(e) => set("status", e.target.value)}
                    options={[
                      { value: "", label: t("trash.filters.all") },
                      ...incidentStatusOptions(t),
                    ]}
                  />
                </>
              )}
              <Input
                label={t("trash.filters.deletedBy")}
                value={filters.deletedBy}
                onChange={(e) => set("deletedBy", e.target.value)}
                placeholder={t("trash.filters.deletedByPlaceholder")}
                autoComplete="off"
              />
              <Input
                label={t("trash.filters.dateFrom")}
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => set("from", e.target.value)}
              />
              <Input
                label={t("trash.filters.dateTo")}
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => set("to", e.target.value)}
              />
            </div>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetAll}
                className="self-start rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("filters.reset")}
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {total !== null ? (
        <p className="-mt-1 text-xs text-muted-foreground" aria-live="polite">
          {tab === "assets"
            ? total === 1
              ? t("trash.countAssetsOne")
              : t("trash.countAssets", { count: total })
            : total === 1
              ? t("trash.countIncidentsOne")
              : t("trash.countIncidents", { count: total })}
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <TrashListSkeleton />
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("trash.loadErrorTitle")}</p>
          <p className="mt-0.5">{t("trash.loadErrorBody")}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={refetch}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : state.data.items.length === 0 ? (
        <EmptyState
          icon={<TrashIcon />}
          title={
            filtersActive
              ? t("trash.emptyFilteredTitle")
              : tab === "assets"
                ? t("trash.emptyAssetsTitle")
                : t("trash.emptyIncidentsTitle")
          }
          description={filtersActive ? t("trash.emptyFilteredBody") : t("trash.emptyBody")}
          action={
            filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                {t("filters.reset")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4 motion-safe:animate-fade-in">
          {tab === "assets" ? (
            <TrashAssetsList
              items={(state.data as TrashAssetPage).items}
              onChanged={refetch}
            />
          ) : (
            <TrashIncidentsList
              items={(state.data as TrashIncidentPage).items}
              onChanged={refetch}
            />
          )}
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
