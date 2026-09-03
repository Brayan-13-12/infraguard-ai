"use client";

import { useState } from "react";

import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge";
import { ApproveRequestDialog } from "@/components/admin/ApproveRequestDialog";
import { permissionLabel } from "@/components/admin/catalog";
import { RoleSelectDialog } from "@/components/admin/RoleSelectDialog";
import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DetailRow } from "@/components/ui/DetailRow";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { notifyAdminChanged } from "@/lib/adminRefresh";
import { groupPermissions } from "@/types/rbac";
import { rejectUser, setUserActive } from "@/services/admin";
import type { AdminUserDetail } from "@/types/rbac";

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale);
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </code>
  );
}

/** Read-only body + (permission-gated) administrative actions for one user. */
export function UserDetailContent({
  user,
  onChanged,
}: {
  user: AdminUserDetail;
  onChanged: (updated: AdminUserDetail) => void;
}) {
  const { t, language } = useTranslation();
  const { can, user: me } = useAuth();
  const locale = LANGUAGE_LOCALES[language];
  const canManage = can("users.manage");

  const [confirm, setConfirm] = useState<"activate" | "deactivate" | "reject" | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = me?.id === user.id;
  const grouped = groupPermissions(user.permissions);
  const isPending = user.account_status === "pending";
  const isRejected = user.account_status === "rejected";
  const isRequest = isPending || isRejected;

  async function doReject() {
    setBusy(true);
    setError(null);
    const res = await rejectUser(user.id);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.kind === "conflict" && res.error.message
          ? res.error.message
          : t("admin.userDetail.actionError"),
      );
      return;
    }
    setConfirm(null);
    notifyAdminChanged({ scope: "users" });
    toast({ tone: "success", description: t("admin.userDetail.rejectedToast") });
    onChanged(res.data);
  }

  async function toggleActive(next: boolean) {
    setBusy(true);
    setError(null);
    const res = await setUserActive(user.id, next);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.kind === "conflict"
          ? (res.error.message ?? t("admin.userDetail.lockoutError"))
          : t("admin.userDetail.actionError"),
      );
      return;
    }
    setConfirm(null);
    notifyAdminChanged({ scope: "users" });
    toast({
      tone: "success",
      description: next
        ? t("admin.userDetail.activatedToast")
        : t("admin.userDetail.deactivatedToast"),
    });
    onChanged(res.data);
  }

  return (
    <div className="flex flex-col gap-5">
      {user.is_last_active_admin ? (
        <Alert tone="warning">
          <p>
            {isSelf
              ? t("admin.userDetail.selfLastAdminNotice")
              : t("admin.userDetail.lastAdminNotice")}
          </p>
        </Alert>
      ) : null}

      {isPending ? (
        <Alert tone="info">
          <p>{t("admin.userDetail.pendingNotice")}</p>
        </Alert>
      ) : null}
      {isRejected ? (
        <Alert tone="warning">
          <p>{t("admin.userDetail.rejectedNotice")}</p>
        </Alert>
      ) : null}

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.userDetail.identity")}
        </h3>
        <dl>
          <DetailRow label={t("admin.userDetail.identity")}>{user.email}</DetailRow>
          <DetailRow label={t("admin.userDetail.status")}>
            <AccountStatusBadge status={user.account_status} />
          </DetailRow>
          <DetailRow label={t("admin.userDetail.roles")}>
            {user.roles.length === 0 ? (
              <span className="text-muted-foreground">{t("admin.common.noRoles")}</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Badge key={r.id} tone={r.slug === "administrator" ? "info" : "neutral"}>
                    {r.name}
                  </Badge>
                ))}
              </div>
            )}
          </DetailRow>
          <DetailRow label={t("admin.common.created")}>
            {formatDateTime(user.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("admin.common.updated")}>
            {formatDateTime(user.updated_at, locale)}
          </DetailRow>
          <DetailRow label={t("admin.common.id")}>
            <Code>{user.id}</Code>
          </DetailRow>
        </dl>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.userDetail.effectivePermissions")}
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">
          {t("admin.userDetail.effectivePermissionsHint")}
        </p>
        {user.account_status !== "active" ? (
          <p className="mb-2 text-xs font-medium text-warning">
            {t("admin.userDetail.noAppAccessHint")}
          </p>
        ) : null}
        {user.permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("admin.userDetail.noPermissions")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {Object.entries(grouped).map(([, codes]) =>
              codes.map((code) => (
                <li key={code} className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{permissionLabel(t, code)}</span>
                  <Code>{code}</Code>
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {isRequest ? (
            <>
              <Button size="sm" onClick={() => setApproveOpen(true)}>
                {t("admin.userDetail.approve")}
              </Button>
              {isPending ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setConfirm("reject")}
                >
                  {t("admin.userDetail.reject")}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setRolesOpen(true)}>
                {t("admin.userDetail.manageRoles")}
              </Button>
              {user.is_active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setConfirm("deactivate")}
                >
                  {t("admin.userDetail.deactivate")}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setConfirm("activate")}>
                  {t("admin.userDetail.activate")}
                </Button>
              )}
            </>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          confirm === "reject" ? void doReject() : void toggleActive(confirm === "activate")
        }
        title={
          confirm === "reject"
            ? t("admin.userDetail.rejectTitle")
            : confirm === "activate"
              ? t("admin.userDetail.activateTitle")
              : t("admin.userDetail.deactivateTitle")
        }
        description={
          confirm === "reject"
            ? t("admin.userDetail.rejectBody", { email: user.email })
            : confirm === "activate"
              ? t("admin.userDetail.activateBody", { email: user.email })
              : t("admin.userDetail.deactivateBody", { email: user.email })
        }
        confirmLabel={
          confirm === "reject"
            ? t("admin.userDetail.rejectConfirm")
            : confirm === "activate"
              ? t("admin.userDetail.activate")
              : t("admin.userDetail.deactivate")
        }
        cancelLabel={t("admin.common.cancel")}
        tone={confirm === "activate" ? "primary" : "danger"}
        loading={busy}
        error={error}
      />

      <RoleSelectDialog
        open={rolesOpen}
        onClose={() => setRolesOpen(false)}
        user={user}
        onSaved={(updated) => {
          setRolesOpen(false);
          onChanged(updated);
        }}
      />

      <ApproveRequestDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        user={user}
        onSaved={(updated) => {
          setApproveOpen(false);
          onChanged(updated);
        }}
      />
    </div>
  );
}
