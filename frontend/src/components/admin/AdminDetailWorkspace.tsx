"use client";

import { AdminRoleLoader, AdminUserLoader } from "@/components/admin/AdminDetailLoader";
import { RoleDetailContent } from "@/components/admin/RoleDetail";
import { UserDetailContent } from "@/components/admin/UserDetail";
import { Forbidden } from "@/components/auth/Forbidden";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { useTranslation } from "@/i18n";

function NotFoundOrError({
  kind,
  reload,
  close,
  notFoundTitle,
  notFoundBody,
}: {
  kind: "notfound" | "error";
  reload: () => void;
  close: () => void;
  notFoundTitle: string;
  notFoundBody: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        {kind === "notfound" ? notFoundTitle : t("admin.common.loadError")}
      </p>
      {kind === "notfound" ? (
        <p className="max-w-xs text-sm text-muted-foreground">{notFoundBody}</p>
      ) : null}
      <div className="mt-1 flex gap-2">
        {kind === "error" ? (
          <Button variant="secondary" size="sm" onClick={reload}>
            {t("admin.common.retry")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={close}>
          {t("overlay.close")}
        </Button>
      </div>
    </div>
  );
}

export function AdminUserWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/admin");

  return (
    <AdminUserLoader
      id={id}
      render={({ state, reload, setItem }) => {
        const label = state.kind === "ready" ? state.item.email : t("admin.userDetail.title");
        return (
          <WorkspaceDialog
            label={label}
            onClose={close}
            header={
              <div className="flex flex-col gap-1">
                <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                  {label}
                </h2>
                <p className="text-xs text-muted-foreground">{t("admin.userDetail.title")}</p>
              </div>
            }
          >
            {state.kind === "loading" ? (
              <Skeleton className="h-64" />
            ) : state.kind === "forbidden" ? (
              <Forbidden compact />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <NotFoundOrError
                kind={state.kind}
                reload={reload}
                close={close}
                notFoundTitle={t("admin.userDetail.notFoundTitle")}
                notFoundBody={t("admin.userDetail.notFoundBody")}
              />
            ) : (
              <UserDetailContent user={state.item} onChanged={setItem} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}

export function AdminRoleWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/admin?tab=roles");

  return (
    <AdminRoleLoader
      id={id}
      render={({ state, reload, setItem }) => {
        const label = state.kind === "ready" ? state.item.name : t("admin.roleDetail.title");
        return (
          <WorkspaceDialog
            label={label}
            onClose={close}
            header={
              <div className="flex flex-col gap-1">
                <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                  {label}
                </h2>
                <p className="text-xs text-muted-foreground">{t("admin.roleDetail.title")}</p>
              </div>
            }
          >
            {state.kind === "loading" ? (
              <Skeleton className="h-64" />
            ) : state.kind === "forbidden" ? (
              <Forbidden compact />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <NotFoundOrError
                kind={state.kind}
                reload={reload}
                close={close}
                notFoundTitle={t("admin.roleDetail.notFoundTitle")}
                notFoundBody={t("admin.roleDetail.notFoundBody")}
              />
            ) : (
              <RoleDetailContent role={state.item} onChanged={setItem} onDeleted={close} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}
