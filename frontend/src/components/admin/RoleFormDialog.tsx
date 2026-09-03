"use client";

import { useEffect, useMemo, useState } from "react";

import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyAdminChanged } from "@/lib/adminRefresh";
import {
  createRole,
  getPermissionCatalog,
  setRolePermissions,
  updateRole,
} from "@/services/admin";
import type { PermissionRead, RoleDetail } from "@/types/rbac";

/**
 * Create a custom role, or edit an existing custom role's name / description /
 * permissions. System roles are never editable (the caller must not open this
 * for one).
 */
export function RoleFormDialog({
  open,
  onClose,
  onSaved,
  role,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (role: RoleDetail) => void;
  /** Provided => edit mode. Omitted => create mode. */
  role?: RoleDetail;
}) {
  const { t } = useTranslation();
  const editing = role !== undefined;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions ?? []),
  );
  const [catalog, setCatalog] = useState<PermissionRead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setSelected(new Set(role?.permissions ?? []));
    setError(null);
    setNameError(null);
    void getPermissionCatalog().then((res) => {
      if (res.ok) setCatalog(res.data.permissions);
    });
  }, [open, role]);

  const toggle = (code: string, next: boolean) =>
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(code);
      else copy.delete(code);
      return copy;
    });

  const selectedCount = selected.size;
  const codes = useMemo(() => [...selected], [selected]);

  async function submit() {
    if (!name.trim()) {
      setNameError(t("admin.roleForm.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);

    if (editing && role) {
      const meta = await updateRole(role.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      if (!meta.ok) {
        setBusy(false);
        setError(meta.error.message ?? t("admin.roleDetail.saveError"));
        return;
      }
      const perms = await setRolePermissions(role.id, codes);
      setBusy(false);
      if (!perms.ok) {
        setError(perms.error.message ?? t("admin.roleDetail.saveError"));
        return;
      }
      notifyAdminChanged({ scope: "roles" });
      toast({ tone: "success", description: t("admin.roleDetail.savedToast") });
      onSaved(perms.data);
      return;
    }

    const res = await createRole({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions: codes,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message ?? t("admin.roleDetail.saveError"));
      return;
    }
    notifyAdminChanged({ scope: "roles" });
    toast({ tone: "success", description: t("admin.roleForm.createdToast") });
    onSaved(res.data);
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={editing ? t("admin.roleForm.editTitle") : t("admin.roleForm.createTitle")}
      description={t("admin.roleForm.permissionsHint")}
      size="lg"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("admin.common.cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} loading={busy}>
            {editing ? t("admin.common.save") : t("admin.roleForm.create")}
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

        <Input
          label={t("admin.roleForm.name")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          placeholder={t("admin.roleForm.namePlaceholder")}
          error={nameError ?? undefined}
          autoComplete="off"
        />
        <Input
          label={t("admin.roleForm.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("admin.roleForm.descriptionPlaceholder")}
          autoComplete="off"
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {t("admin.roleForm.permissions")}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("admin.roleForm.selectedCount", { count: selectedCount })}
            </span>
          </div>
          {catalog === null ? (
            <Skeleton className="h-48" />
          ) : (
            <PermissionMatrix
              catalog={catalog}
              selected={selected}
              onToggle={toggle}
              idBase="roleform"
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
