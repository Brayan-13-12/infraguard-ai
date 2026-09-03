"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleFormDialog } from "@/components/admin/RoleFormDialog";
import { RolesList } from "@/components/admin/RolesList";
import { UsersList } from "@/components/admin/UsersList";
import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Reveal } from "@/components/ui/Reveal";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, useTabsId } from "@/components/ui/Tabs";
import { PlusIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { subscribeAdminChanged } from "@/lib/adminRefresh";
import { listAccessRequests, listRoles, listUsers } from "@/services/admin";
import type { AdminUserPage, RolePage } from "@/types/rbac";

type Tab = "users" | "requests" | "roles";
const USERS_PAGE_SIZE = 20;

type Load<T> = { kind: "loading" } | { kind: "loaded"; data: T } | { kind: "error" };

function parseTab(p: URLSearchParams): Tab {
  const tab = p.get("tab");
  if (tab === "roles") return "roles";
  if (tab === "requests") return "requests";
  return "users";
}

function SummaryStrip({
  users,
  roles,
  tab,
  pending,
}: {
  users: AdminUserPage | null;
  roles: RolePage | null;
  tab: Tab;
  pending: number | undefined;
}) {
  const { t } = useTranslation();
  const activeUsers = users?.items.filter((u) => u.is_active).length;
  const customRoles = roles?.items.filter((r) => !r.is_system).length;
  const cell = (value: number | undefined, label: string, on: boolean) => (
    <div className="flex items-baseline gap-1.5">
      <dd
        className={cn(
          "text-sm font-semibold tabular-nums",
          on ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </dd>
      <dt>{label}</dt>
    </div>
  );
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {cell(users?.total, t("admin.summary.users"), tab === "users")}
      {cell(activeUsers, t("admin.summary.activeUsers"), tab === "users")}
      {cell(pending, t("admin.summary.pendingRequests"), tab === "requests")}
      {cell(roles?.total, t("admin.summary.roles"), tab === "roles")}
      {cell(customRoles, t("admin.summary.customRoles"), tab === "roles")}
    </dl>
  );
}

export function AdminBrowser() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabsId = useTabsId("admin");

  const initialTab = useMemo(() => parseTab(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(
    () => ({
      search: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      role: searchParams.get("role") ?? "",
      page: Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1),
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canReadUsers = can("users.read");
  const canReadRoles = can("roles.read");
  const canManageRoles = can("roles.manage");

  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab === "roles") return canReadRoles ? "roles" : "users";
    if (initialTab === "requests" && canReadUsers) return "requests";
    if (canReadUsers) return "users";
    return "roles";
  });
  const [search, setSearch] = useState(initial.search);
  const [debounced, setDebounced] = useState(initial.search);
  const [status, setStatus] = useState(initial.status);
  const [role, setRole] = useState(initial.role);
  const [page, setPage] = useState(initial.page);

  const [users, setUsers] = useState<Load<AdminUserPage>>({ kind: "loading" });
  const [roles, setRoles] = useState<Load<RolePage>>({ kind: "loading" });
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const inRequests = tab === "requests";

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => subscribeAdminChanged(() => setReloadKey((k) => k + 1)), []);

  useEffect(() => {
    setPage(1);
  }, [debounced, status, role, tab]);

  // Sync URL.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (tab === "roles") qs.set("tab", "roles");
    if (tab === "requests") qs.set("tab", "requests");
    if (tab === "users") {
      if (debounced.trim()) qs.set("q", debounced.trim());
      if (status) qs.set("status", status);
      if (role) qs.set("role", role);
      if (page > 1) qs.set("page", String(page));
    }
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [tab, debounced, status, role, page, pathname, router]);

  // Fetch the user / access-request list for the active tab.
  useEffect(() => {
    if (!canReadUsers) return;
    let cancelled = false;
    setUsers({ kind: "loading" });
    const fetcher = inRequests
      ? listAccessRequests({ page, pageSize: USERS_PAGE_SIZE, q: debounced })
      : listUsers({
          page,
          pageSize: USERS_PAGE_SIZE,
          q: debounced,
          status: status || undefined,
          role: role || undefined,
        });
    void fetcher.then((res) => {
      if (!cancelled) {
        setUsers(res.ok ? { kind: "loaded", data: res.data } : { kind: "error" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canReadUsers, inRequests, page, debounced, status, role, reloadKey]);

  // Pending-request count for the tab badge + summary (cheap: total only).
  useEffect(() => {
    if (!canReadUsers) return;
    let cancelled = false;
    void listAccessRequests({ pageSize: 1 }).then((res) => {
      if (!cancelled && res.ok) setPendingCount(res.data.total);
    });
    return () => {
      cancelled = true;
    };
  }, [canReadUsers, reloadKey]);

  // Fetch roles (also feeds the role filter + summary).
  useEffect(() => {
    if (!canReadRoles) return;
    let cancelled = false;
    setRoles({ kind: "loading" });
    void listRoles().then((res) => {
      if (!cancelled) {
        setRoles(res.ok ? { kind: "loaded", data: res.data } : { kind: "error" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canReadRoles, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
  const resetFilters = useCallback(() => {
    setSearch("");
    setDebounced("");
    setStatus("");
    setRole("");
  }, []);

  const roleOptions = roles.kind === "loaded" ? roles.data.items : [];
  const filtersActive = debounced.trim() !== "" || status !== "" || role !== "";

  const requestsLabel =
    pendingCount && pendingCount > 0
      ? `${t("admin.tabs.requests")} (${pendingCount})`
      : t("admin.tabs.requests");
  const tabDefs = [
    canReadUsers ? { id: "users", label: t("admin.tabs.users") } : null,
    canReadUsers ? { id: "requests", label: requestsLabel } : null,
    canReadRoles ? { id: "roles", label: t("admin.tabs.roles") } : null,
  ].filter((x): x is { id: string; label: string } => x !== null);

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <PageHeader title="Administration" description={t("admin.subtitle")} />
      </Reveal>

      <Reveal delayMs={40}>
        <SummaryStrip
          users={users.kind === "loaded" ? users.data : null}
          roles={roles.kind === "loaded" ? roles.data : null}
          tab={tab}
          pending={pendingCount}
        />
      </Reveal>

      {tabDefs.length > 1 ? (
        <Reveal delayMs={60}>
          <Tabs
            idBase={tabsId}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            tabs={tabDefs}
          />
        </Reveal>
      ) : null}

      {(tab === "users" || tab === "requests") && canReadUsers ? (
        <>
          {inRequests ? (
            <p className="text-sm text-muted-foreground">{t("admin.requests.subtitle")}</p>
          ) : (
            <Card className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label={t("admin.users.searchPlaceholder")}
                  hideLabel
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("admin.users.searchPlaceholder")}
                  autoComplete="off"
                  trailing={<SearchIcon className="text-muted-foreground" />}
                />
                <Select
                  label={t("admin.users.filterStatus")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={[
                    { value: "", label: t("admin.users.allStatuses") },
                    { value: "active", label: t("admin.users.statusActive") },
                    { value: "pending", label: t("admin.users.statusPending") },
                    { value: "rejected", label: t("admin.users.statusRejected") },
                    { value: "disabled", label: t("admin.users.statusDisabled") },
                  ]}
                />
                <Select
                  label={t("admin.users.filterRole")}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={[
                    { value: "", label: t("admin.users.allRoles") },
                    ...roleOptions.map((r) => ({ value: r.slug, label: r.name })),
                  ]}
                />
              </div>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="self-start rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t("admin.users.clearFilters")}
                </button>
              ) : null}
            </Card>
          )}

          {users.kind === "loading" ? (
            <Skeleton className="h-64" />
          ) : users.kind === "error" ? (
            <Alert tone="danger">
              <p className="font-medium text-foreground">{t("admin.common.loadError")}</p>
              <p className="mt-0.5">{t("admin.common.loadErrorBody")}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={refetch}>
                {t("admin.common.retry")}
              </Button>
            </Alert>
          ) : users.data.items.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title={
                inRequests
                  ? t("admin.requests.empty")
                  : filtersActive
                    ? t("admin.users.emptyFiltered")
                    : t("admin.users.empty")
              }
              action={
                !inRequests && filtersActive ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    {t("admin.users.clearFilters")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="-mt-1 text-xs text-muted-foreground" aria-live="polite">
                {inRequests
                  ? users.data.total === 1
                    ? t("admin.requests.countOne")
                    : t("admin.requests.count", { count: users.data.total })
                  : users.data.total === 1
                    ? t("admin.users.countOne")
                    : t("admin.users.count", { count: users.data.total })}
              </p>
              <UsersList items={users.data.items} />
              <Pagination
                page={users.data.page}
                pageSize={users.data.page_size}
                total={users.data.total}
                totalPages={users.data.total_pages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      ) : null}

      {tab === "roles" && canReadRoles ? (
        <>
          {canManageRoles ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <PlusIcon />
                {t("admin.roles.newRole")}
              </Button>
            </div>
          ) : null}

          {roles.kind === "loading" ? (
            <Skeleton className="h-64" />
          ) : roles.kind === "error" ? (
            <Alert tone="danger">
              <p className="font-medium text-foreground">{t("admin.common.loadError")}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={refetch}>
                {t("admin.common.retry")}
              </Button>
            </Alert>
          ) : roles.data.items.length === 0 ? (
            <EmptyState icon={<UsersIcon />} title={t("admin.roles.empty")} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="-mt-1 text-xs text-muted-foreground">
                {roles.data.total === 1
                  ? t("admin.roles.countOne")
                  : t("admin.roles.count", { count: roles.data.total })}
              </p>
              <RolesList items={roles.data.items} />
            </div>
          )}

          <RoleFormDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onSaved={(role) => {
              setCreateOpen(false);
              refetch();
              router.push(`/admin/roles/${role.id}`);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
