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
import { approveUser, getRole, listRoleRefs } from "@/services/admin";
import type { AdminUserDetail, RoleRef } from "@/types/rbac";

const DEFAULT_SLUG = "viewer";

/**
 * Approve an access request. Role assignment is **required** - approving with
 * no roles would create an unusable account, so the confirm button stays
 * disabled until at least one role is picked. Viewer is pre-selected.
 */
export function ApproveRequestDialog({
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [permsByRole, setPermsByRole] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelected(new Set(user.roles.map((r) => r.id)));
    void listRoleRefs().then((res) => {
      if (!res.ok) return;
      setAllRoles(res.data);
      if (user.roles.length === 0) {
        const fallback = res.data.find((r) => r.slug === DEFAULT_SLUG);
        if (fallback) setSelected(new Set([fallback.id]));
      }
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

  async function save() {
    if (selected.size === 0) {
      setError(t("admin.userDetail.approveNoRoles"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await approveUser(user.id, [...selected]);
    setBusy(false);
    if (!res.ok) {
      setError(
        (res.error.kind === "conflict" || res.error.kind === "validation") && res.error.message
          ? res.error.message
          : t("admin.userDetail.actionError"),
      );
      return;
    }
    notifyAdminChanged({ scope: "users" });
    toast({ tone: "success", description: t("admin.userDetail.approvedToast") });
    onSaved(res.data);
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("admin.userDetail.approveTitle", { email: user.email })}
      description={t("admin.userDetail.approveHint")}
      size="lg"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("admin.common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            loading={busy}
            disabled={selected.size === 0}
          >
            {t("admin.userDetail.approve")}
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

        {allRoles === null ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {allRoles.map((r) => {
              const inputId = `approve-role-${r.id}`;
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
