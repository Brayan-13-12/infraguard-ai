"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { EditRelationshipDialog } from "@/components/assets/relationships/EditRelationshipDialog";
import { relationshipTypeLabel } from "@/components/assets/relationships/catalog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { CloseIcon, LinkIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { DEPENDENCIES_PAGE_SIZE } from "@/lib/config";
import { getAsset } from "@/services/assets";
import {
  deleteRelationship,
  getRelationshipsSummary,
  listRelationships,
} from "@/services/relationships";
import type { Asset } from "@/types/asset";
import type { RelationshipDetail, RelationshipSummary } from "@/types/relationship";

import { CreateRelationshipDialog } from "./CreateRelationshipDialog";
import {
  DependenciesFilters,
  EMPTY_DEPENDENCIES_FILTERS,
  type DependenciesFilterState,
} from "./DependenciesFilters";
import { RelationshipRow } from "./RelationshipRow";

type ListState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; page: RelationshipDetail[]; total: number; totalPages: number };

function parseParams(params: URLSearchParams): {
  page: number;
  search: string;
  filters: DependenciesFilterState;
  assetId: string;
} {
  return {
    page: Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
    search: params.get("q") ?? "",
    filters: {
      relationshipType: params.get("type") ?? "",
      environment: params.get("environment") ?? "",
      criticality: params.get("criticality") ?? "",
      assetType: params.get("asset_type") ?? "",
    },
    assetId: params.get("asset_id") ?? "",
  };
}

export function DependenciesBrowser() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("relationships.manage");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => parseParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [filters, setFilters] = useState<DependenciesFilterState>(initial.filters);
  const [assetId, setAssetId] = useState(initial.assetId);
  const [focusedAsset, setFocusedAsset] = useState<Asset | null>(null);

  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [summary, setSummary] = useState<RelationshipSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RelationshipDetail | null>(null);
  const [deleting, setDeleting] = useState<RelationshipDetail | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const firstRun = useRef(true);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (firstRun.current) return;
    setPage(1);
  }, [debouncedSearch, filters, assetId]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    if (filters.relationshipType) qs.set("type", filters.relationshipType);
    if (filters.environment) qs.set("environment", filters.environment);
    if (filters.criticality) qs.set("criticality", filters.criticality);
    if (filters.assetType) qs.set("asset_type", filters.assetType);
    if (assetId) qs.set("asset_id", assetId);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [page, debouncedSearch, filters, assetId, pathname, router]);

  useEffect(() => {
    if (!assetId) {
      setFocusedAsset(null);
      return;
    }
    let cancelled = false;
    void getAsset(assetId).then((res) => {
      if (!cancelled && res.ok) setFocusedAsset(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const loadSummary = useCallback(() => {
    void getRelationshipsSummary().then((res) => {
      if (res.ok) setSummary(res.data);
    });
  }, []);

  useEffect(loadSummary, [loadSummary, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    void listRelationships({
      page,
      pageSize: DEPENDENCIES_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      relationshipType: filters.relationshipType ? [filters.relationshipType] : undefined,
      environment: filters.environment || undefined,
      criticality: filters.criticality || undefined,
      assetType: filters.assetType || undefined,
      assetId: assetId || undefined,
    }).then((res) => {
      if (cancelled) return;
      firstRun.current = false;
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({
        kind: "ready",
        page: res.data.items,
        total: res.data.total,
        totalPages: res.data.total_pages,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, filters, assetId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const clearAssetFilter = useCallback(() => setAssetId(""), []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await deleteRelationship(deleting.id);
    setDeleteBusy(false);
    if (!res.ok) {
      toast({ tone: "danger", description: t("relationships.errors.generic") });
      return;
    }
    toast({ tone: "success", description: t("relationships.deletedToast") });
    setDeleting(null);
    reload();
  }

  const filtersActive =
    filters.relationshipType !== "" ||
    filters.environment !== "" ||
    filters.criticality !== "" ||
    filters.assetType !== "" ||
    debouncedSearch.trim() !== "";

  const resetAll = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY_DEPENDENCIES_FILTERS);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dependencies.title")}
        description={t("dependencies.subtitle")}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon className="h-4 w-4" />
              {t("dependencies.newRelation")}
            </Button>
          ) : undefined
        }
      />

      {focusedAsset ? (
        <Alert tone="info" className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("dependencies.assetFilterBanner", { name: focusedAsset.name })}</span>
          <button
            type="button"
            onClick={clearAssetFilter}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            {t("dependencies.clearAssetFilter")}
          </button>
        </Alert>
      ) : null}

      {summary ? (
        <p className="-mb-2 text-sm text-muted-foreground" aria-live="polite">
          {t("dependencies.summary", {
            total: summary.total,
            connected: summary.connected_assets,
            types: summary.relationship_types,
          })}
          {summary.assets_without_relationships > 0
            ? ` · ${t("dependencies.summaryUnrelated", { count: summary.assets_without_relationships })}`
            : ""}
        </p>
      ) : null}

      <Card className="flex flex-col gap-3.5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              label={t("dependencies.searchLabel")}
              hideLabel
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dependencies.searchPlaceholder")}
              autoComplete="off"
              trailing={<SearchIcon className="text-muted-foreground" />}
            />
          </div>
          <DependenciesFilters value={filters} onChange={setFilters} />
        </div>
      </Card>

      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <Alert tone="danger">
          <p className="font-medium text-foreground">{t("dependencies.loadErrorTitle")}</p>
          <p className="mt-0.5">{t("dependencies.loadErrorBody")}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            {t("dependencies.retry")}
          </Button>
        </Alert>
      ) : state.page.length === 0 ? (
        <EmptyState
          icon={<LinkIcon />}
          title={
            filtersActive || focusedAsset
              ? t("dependencies.empty.filteredTitle")
              : t("dependencies.empty.title")
          }
          description={
            filtersActive || focusedAsset
              ? t("dependencies.empty.filteredBody")
              : t("dependencies.empty.body")
          }
          action={
            filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetAll}>
                {t("dependencies.filters.reset")}
              </Button>
            ) : canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <PlusIcon className="h-4 w-4" />
                {t("dependencies.newRelation")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            {state.page.map((rel) => (
              <RelationshipRow
                key={rel.id}
                relationship={rel}
                canManage={canManage}
                onEdit={() => setEditing(rel)}
                onDelete={() => setDeleting(rel)}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={DEPENDENCIES_PAGE_SIZE}
            total={state.total}
            totalPages={state.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {creating ? (
        <CreateRelationshipDialog
          initialSource={focusedAsset}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast({ tone: "success", description: t("relationships.createdToast") });
            reload();
          }}
        />
      ) : null}

      {editing ? (
        <EditRelationshipDialog
          relationship={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ tone: "success", description: t("relationships.updatedToast") });
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={t("relationships.deleteConfirmTitle")}
        description={
          deleting
            ? t("relationships.deleteConfirmBody", {
                source: deleting.source.name,
                type: relationshipTypeLabel(t, deleting.relationship_type),
                target: deleting.target.name,
              })
            : ""
        }
        confirmLabel={t("relationships.deleteAction")}
        tone="danger"
        loading={deleteBusy}
      />
    </div>
  );
}

