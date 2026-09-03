"use client";

import { useEffect, useMemo, useState } from "react";

import { permissionLabel } from "@/components/admin/catalog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyAdminChanged } from "@/lib/adminRefresh";
import { getRole, listRoleRefs, setUserRoles } from "@/services/admin";
import type { AdminUserDetail, RoleRef } from "@/types/rbac";

const ADMIN_SLUG = "administrator";

/**
 * "Manage roles" for a user: an intentional checkbox list (system roles first),
 * a live effective-permission preview, and an explicit confirm when the change
 * removes the Administrator role.
 */
export function RoleSelectDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: AdminUserDetail;
  onSaved: (updated: AdminUserDetail) => void;
}) {
  const { t } = useTranslation();

  const [allRoles, setAllRoles] = useState<RoleRef[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(user.roles.map((r) => r.id)),
  );
  const [permsByRole, setPermsByRole] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(user.roles.map((r) => r.id)));
    setError(null);
    void listRoleRefs().then((res) => {
      if (!res.ok) return;
      setAllRoles(res.data);
      // Fetch each role's permission set once, for the live preview.
      void Promise.all(res.data.map((r) => getRole(r.id))).then((details) => {
        const map: Record<string, string[]> = {};
        for (const d of details) if (d.ok) map[d.data.id] = d.data.permissions;
        setPermsByRole(map);
      });
    });
  }, [open, user]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });

  const effectivePreview = useMemo(() => {
    const set = new Set<string>();
    for (const id of selected) for (const code of permsByRole[id] ?? []) set.add(code);
    return [...set].sort();
  }, [selected, permsByRole]);

  const adminRole = allRoles?.find((r) => r.slug === ADMIN_SLUG);
  const removingAdmin =
    adminRole !== undefined &&
    user.roles.some((r) => r.slug === ADMIN_SLUG) &&
    !selected.has(adminRole.id);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await setUserRoles(user.id, [...selected]);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.kind === "conflict"
          ? (res.error.message ?? t("admin.userDetail.lockoutError"))
          : t("admin.userDetail.actionError"),
      );
      return;
    }
    notifyAdminChanged({ scope: "users" });
    toast({ tone: "success", description: t("admin.userDetail.rolesUpdatedToast") });
    onSaved(res.data);
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.userDetail.manageRolesTitle", { email: user.email })}
      description={t("admin.userDetail.manageRolesHint")}
      size="lg"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("admin.common.cancel")}
          </Button>
          <Button
            size="sm"
            variant={removingAdmin ? "danger" : "primary"}
            onClick={() => void save()}
            loading={busy}
          >
            {t("admin.common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger">
            <p>{error}</p>
          </Alert>
        ) : null}

        {removingAdmin ? (
          <Alert tone="warning">
            <p className="font-medium text-foreground">
              {t("admin.userDetail.removingAdminTitle")}
            </p>
            <p className="mt-0.5">
              {t("admin.userDetail.removingAdminBody", { email: user.email })}
            </p>
          </Alert>
        ) : null}

        {allRoles === null ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {allRoles.map((r) => {
              const inputId = `role-${r.id}`;
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <label htmlFor={inputId} className="flex flex-1 items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{r.name}</span>
                    <Badge tone={r.is_system ? "info" : "neutral"}>
                      {r.is_system ? t("admin.common.system") : t("admin.common.custom")}
                    </Badge>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.userDetail.effectivePermissions")}
          </p>
          {effectivePreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.userDetail.noPermissions")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {effectivePreview.map((code) => (
                <span
                  key={code}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  title={code}
                >
                  {permissionLabel(t, code)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
