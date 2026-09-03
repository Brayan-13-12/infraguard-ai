"use client";

import Link from "next/link";
import { useState } from "react";

import { permissionLabel } from "@/components/admin/catalog";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { RoleFormDialog } from "@/components/admin/RoleFormDialog";
import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DetailRow } from "@/components/ui/DetailRow";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, tabPanelProps, useTabsId } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { notifyAdminChanged } from "@/lib/adminRefresh";
import { deleteRole, getPermissionCatalog } from "@/services/admin";
import type { PermissionRead, RoleDetail as RoleDetailT } from "@/types/rbac";

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale);
}

type Tab = "summary" | "permissions" | "users";

export function RoleDetailContent({
  role,
  onChanged,
  onDeleted,
}: {
  role: RoleDetailT;
  onChanged: (updated: RoleDetailT) => void;
  onDeleted: () => void;
}) {
  const { t, language } = useTranslation();
  const { can } = useAuth();
  const locale = LANGUAGE_LOCALES[language];
  const tabsId = useTabsId("role");
  const canManage = can("roles.manage") && !role.is_system;

  const [tab, setTab] = useState<Tab>("summary");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PermissionRead[] | null>(null);

  function openPermissions() {
    setTab("permissions");
    if (catalog === null) {
      void getPermissionCatalog().then((res) => {
        if (res.ok) setCatalog(res.data.permissions);
      });
    }
  }

  async function doDelete() {
    setBusy(true);
    setError(null);
    const res = await deleteRole(role.id);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.kind === "conflict"
          ? (res.error.message ?? t("admin.roleDetail.saveError"))
          : t("admin.roleDetail.saveError"),
      );
      return;
    }
    setConfirmDelete(false);
    notifyAdminChanged({ scope: "roles" });
    toast({ tone: "success", description: t("admin.roleDetail.deletedToast") });
    onDeleted();
  }

  const selectedCodes = new Set(role.permissions);

  return (
    <div className="flex flex-col gap-4">
      {role.is_system ? (
        <Alert tone="info">
          <p>{t("admin.roleDetail.systemRoleNotice")}</p>
        </Alert>
      ) : null}

      <Tabs
        idBase={tabsId}
        value={tab}
        onChange={(id) => (id === "permissions" ? openPermissions() : setTab(id as Tab))}
        tabs={[
          { id: "summary", label: t("admin.roleDetail.tabs.summary") },
          { id: "permissions", label: t("admin.roleDetail.tabs.permissions") },
          { id: "users", label: t("admin.roleDetail.tabs.users"), badge: role.users.length },
        ]}
      />

      {tab === "summary" ? (
        <dl {...tabPanelProps(tabsId, "summary")}>
          <DetailRow label={t("admin.roleDetail.name")}>{role.name}</DetailRow>
          <DetailRow label={t("admin.roleDetail.type")}>
            <Badge tone={role.is_system ? "info" : "neutral"}>
              {role.is_system ? t("admin.common.system") : t("admin.common.custom")}
            </Badge>
          </DetailRow>
          <DetailRow label={t("admin.roleDetail.description")}>
            {role.description ?? (
              <span className="text-muted-foreground">
                {t("admin.roleDetail.noDescription")}
              </span>
            )}
          </DetailRow>
          <DetailRow label={t("admin.common.created")}>
            {formatDateTime(role.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("admin.common.id")}>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {role.slug}
            </code>
          </DetailRow>
        </dl>
      ) : null}

      {tab === "permissions" ? (
        <div {...tabPanelProps(tabsId, "permissions")}>
          {role.permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.roleDetail.noPermissions")}
            </p>
          ) : catalog === null ? (
            <ul className="flex flex-col gap-1.5">
              {role.permissions.map((code) => (
                <li key={code} className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{permissionLabel(t, code)}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {code}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <PermissionMatrix catalog={catalog} selected={selectedCodes} readOnly />
          )}
        </div>
      ) : null}

      {tab === "users" ? (
        <div {...tabPanelProps(tabsId, "users")}>
          {role.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.roleDetail.noUsers")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {role.users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="min-w-0 truncate text-foreground hover:underline"
                  >
                    {u.email}
                  </Link>
                  <Badge tone={u.is_active ? "success" : "danger"}>
                    {u.is_active ? t("admin.common.active") : t("admin.common.disabled")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            {t("admin.roleDetail.editRole")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10 hover:text-danger"
            onClick={() => setConfirmDelete(true)}
          >
            {t("admin.roleDetail.deleteRole")}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
        title={t("admin.roleDetail.deleteTitle", { name: role.name })}
        description={
          role.users.length > 0
            ? t("admin.roleDetail.deleteInUseBody", { count: role.users.length })
            : t("admin.roleDetail.deleteBody")
        }
        confirmLabel={t("admin.common.delete")}
        cancelLabel={t("admin.common.cancel")}
        tone="danger"
        loading={busy}
        error={error}
      />

      {editOpen ? (
        <RoleFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          role={role}
          onSaved={(updated) => {
            setEditOpen(false);
            onChanged(updated);
          }}
        />
      ) : null}
    </div>
  );
}

export function RoleDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-48" />
    </div>
  );
}
