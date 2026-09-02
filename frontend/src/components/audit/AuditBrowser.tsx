"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Select } from "@/components/ui/Select";
import { ChevronDownIcon, FilterIcon, HistoryIcon, SearchIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { AUDIT_PAGE_SIZE } from "@/lib/config";
import { cn } from "@/lib/cn";
import { getAuditSummary, listAudit, type AuditListParams } from "@/services/audit";
import {
  FILTERABLE_AUDIT_ACTIONS,
  FILTERABLE_AUDIT_ENTITY_TYPES,
  type AuditEventListItem,
  type AuditSummary,
} from "@/types/audit";

import { AuditTimeline } from "./AuditTimeline";
import { AuditTimelineSkeleton } from "./AuditTimelineSkeleton";
import { auditActionOptions, auditEntityOptions } from "./catalog";

interface Filters {
  action: string;
  entityType: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { action: "", entityType: "", actor: "", from: "", to: "" };

function parseParams(params: URLSearchParams): { search: string; filters: Filters } {
  return {
    search: params.get("q") ?? "",
    filters: {
      action: params.get("action") ?? "",
      entityType: params.get("entity_type") ?? "",
      actor: params.get("actor") ?? "",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
    },
  };
}

function activeFilterCount(f: Filters): number {
  return (
    (f.action ? 1 : 0) +
    (f.entityType ? 1 : 0) +
    (f.actor.trim() ? 1 : 0) +
    (f.from ? 1 : 0) +
    (f.to ? 1 : 0)
  );
}

type LoadState =
  | { kind: "loading" }
  | {
      kind: "loaded";
      events: AuditEventListItem[];
      total: number;
      nextPage: number;
      loadingMore: boolean;
      loadMoreError: boolean;
    }
  | { kind: "error" };

/** Thin, single-line "activity today" strip - never competes with the feed. */
function SummaryStrip({ summary }: { summary: AuditSummary }) {
  const { t } = useTranslation();
  const cells: [string, number][] = [
    [t("audit.summary.eventsToday"), summary.events_today],
    [t("audit.summary.changesToday"), summary.changes_today],
    [t("audit.summary.loginsToday"), summary.logins_today],
    [t("audit.summary.activeActorsToday"), summary.active_actors_today],
  ];
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {cells.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function AuditBrowser() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => parseParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount(initial.filters) > 0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const params = useMemo(
    (): Omit<AuditListParams, "page"> => ({
      pageSize: AUDIT_PAGE_SIZE,
      q: debouncedSearch,
      action: filters.action || undefined,
      entityType: filters.entityType || undefined,
      actor: filters.actor || undefined,
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
    }),
    [debouncedSearch, filters],
  );

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  // Keep the URL in sync (filters only - the feed position is not shareable).
  useEffect(() => {
    const qs = new URLSearchParams();
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    if (filters.action) qs.set("action", filters.action);
    if (filters.entityType) qs.set("entity_type", filters.entityType);
    if (filters.actor.trim()) qs.set("actor", filters.actor.trim());
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [debouncedSearch, filters, pathname, router]);

  // (Re)load the first page whenever the filters change.
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void listAudit({ ...params, page: 1 }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? {
              kind: "loaded",
              events: result.data.items,
              total: result.data.total,
              nextPage: 2,
              loadingMore: false,
              loadMoreError: false,
            }
          : { kind: "error" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [params, reloadKey]);

  // Compact activity summary.
  useEffect(() => {
    let cancelled = false;
    void getAuditSummary().then((res) => {
      if (!cancelled) setSummary(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loadMore = useCallback(() => {
    if (state.kind !== "loaded" || state.loadingMore) return;
    if (state.events.length >= state.total) return;
    const page = state.nextPage;
    setState((s) => (s.kind === "loaded" ? { ...s, loadingMore: true, loadMoreError: false } : s));
    void listAudit({ ...params, page }).then((result) => {
      setState((cur) => {
        if (cur.kind !== "loaded") return cur;
        if (!result.ok) return { ...cur, loadingMore: false, loadMoreError: true };
        const seen = new Set(cur.events.map((e) => e.id));
        const merged = [
          ...cur.events,
          ...result.data.items.filter((e) => !seen.has(e.id)),
        ];
        return {
          ...cur,
          events: merged,
          total: result.data.total,
          nextPage: cur.nextPage + 1,
          loadingMore: false,
          loadMoreError: false,
        };
      });
    });
  }, [state, params]);

  const resetAll = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY);
  }, []);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const filterCount = activeFilterCount(filters);
  const filtersActive = filterCount > 0 || debouncedSearch.trim() !== "";
  const total = state.kind === "loaded" ? state.total : null;
  const loaded = state.kind === "loaded" ? state.events.length : 0;
  const hasMore = state.kind === "loaded" && loaded < state.total;

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <PageHeader title="Audit" description={t("audit.subtitle")} />
      </Reveal>

      {summary ? (
        <Reveal delayMs={40}>
          <SummaryStrip summary={summary} />
        </Reveal>
      ) : null}

      <Reveal delayMs={60}>
        <Card className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2.5">
            <Input
              label={t("audit.searchLabel")}
              hideLabel
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("audit.searchPlaceholder")}
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
                <Select
                  label={t("audit.filters.action")}
                  value={filters.action}
                  onChange={(e) => set("action", e.target.value)}
                  options={[
                    { value: "", label: t("audit.filters.allActions") },
                    ...auditActionOptions(t, FILTERABLE_AUDIT_ACTIONS),
                  ]}
                />
                <Select
                  label={t("audit.filters.entity")}
                  value={filters.entityType}
                  onChange={(e) => set("entityType", e.target.value)}
                  options={[
                    { value: "", label: t("audit.filters.allEntities") },
                    ...auditEntityOptions(t, FILTERABLE_AUDIT_ENTITY_TYPES),
                  ]}
                />
                <Input
                  label={t("audit.filters.actor")}
                  value={filters.actor}
                  onChange={(e) => set("actor", e.target.value)}
                  placeholder={t("audit.filters.actorPlaceholder")}
                  autoComplete="off"
                />
                <Input
                  label={t("audit.filters.dateFrom")}
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => set("from", e.target.value)}
                />
                <Input
                  label={t("audit.filters.dateTo")}
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
      </Reveal>

      {total !== null ? (
        <p className="-mt-1 text-xs text-muted-foreground" aria-live="polite">
          {total === 1 ? t("audit.countOne") : t("audit.count", { count: total })}
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <AuditTimelineSkeleton />
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("audit.loadErrorTitle")}</p>
          <p className="mt-0.5">{t("audit.loadErrorBody")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("audit.retry")}
          </Button>
        </Alert>
      ) : state.events.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title={filtersActive ? t("audit.emptyFilteredTitle") : t("audit.emptyTitle")}
          description={filtersActive ? t("audit.emptyFilteredBody") : t("audit.emptyBody")}
          action={
            filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                {t("filters.reset")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-5 motion-safe:animate-fade-in">
          <AuditTimeline events={state.events} />

          {hasMore ? (
            <div className="flex flex-col items-center gap-2">
              {state.loadMoreError ? (
                <p className="text-xs text-danger">{t("audit.loadErrorBody")}</p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={loadMore}
                loading={state.loadingMore}
              >
                {t("audit.loadMore")}
              </Button>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {t("audit.loadedOf", { loaded, total: state.total })}
              </p>
            </div>
          ) : (
            <p className="pb-2 text-center text-[11px] text-muted-foreground">
              {t("audit.endOfHistory")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
