"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminRoleLoader, AdminUserLoader } from "@/components/admin/AdminDetailLoader";
import { RoleDetailContent } from "@/components/admin/RoleDetail";
import { UserDetailContent } from "@/components/admin/UserDetail";
import { Forbidden } from "@/components/auth/Forbidden";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { ArrowLeftIcon, UsersIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {label}
    </Link>
  );
}

/** Full-page user detail - deep-link / refresh fallback for the workspace. */
export function AdminUserDetailPage({ id }: { id: string }) {
  const { t } = useTranslation();

  return (
    <AdminUserLoader
      id={id}
      render={({ state, reload, setItem }) => {
        if (state.kind === "loading") {
          return (
            <div className="flex justify-center py-20">
              <Spinner decorative />
            </div>
          );
        }
        if (state.kind === "forbidden") return <Forbidden />;
        if (state.kind === "notfound" || state.kind === "error") {
          return (
            <EmptyState
              icon={<UsersIcon />}
              title={
                state.kind === "notfound"
                  ? t("admin.userDetail.notFoundTitle")
                  : t("admin.common.loadError")
              }
              description={
                state.kind === "notfound" ? t("admin.userDetail.notFoundBody") : undefined
              }
              action={
                <div className="flex gap-2">
                  {state.kind === "error" ? (
                    <Button variant="secondary" size="sm" onClick={reload}>
                      {t("admin.common.retry")}
                    </Button>
                  ) : null}
                  <Link
                    href="/admin"
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("admin.title")}
                  </Link>
                </div>
              }
            />
          );
        }
        return (
          <Reveal>
            <div className="flex flex-col gap-4">
              <BackLink href="/admin" label={t("admin.title")} />
              <PageHeader title={state.item.email} description={t("admin.userDetail.title")} />
              <UserDetailContent
                user={state.item}
                onChanged={(u) => {
                  setItem(u);
                }}
              />
            </div>
          </Reveal>
        );
      }}
    />
  );
}

export function AdminRoleDetailPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <AdminRoleLoader
      id={id}
      render={({ state, setItem }) => {
        if (state.kind === "loading") return <Skeleton className="h-64" />;
        if (state.kind === "forbidden") return <Forbidden />;
        if (state.kind === "notfound" || state.kind === "error") {
          return (
            <EmptyState
              icon={<UsersIcon />}
              title={
                state.kind === "notfound"
                  ? t("admin.roleDetail.notFoundTitle")
                  : t("admin.common.loadError")
              }
              description={
                state.kind === "notfound" ? t("admin.roleDetail.notFoundBody") : undefined
              }
              action={
                <Link
                  href="/admin?tab=roles"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  {t("admin.title")}
                </Link>
              }
            />
          );
        }
        return (
          <Reveal>
            <div className="flex flex-col gap-4">
              <BackLink href="/admin?tab=roles" label={t("admin.title")} />
              <PageHeader title={state.item.name} description={t("admin.roleDetail.title")} />
              <RoleDetailContent
                role={state.item}
                onChanged={setItem}
                onDeleted={() => router.push("/admin?tab=roles")}
              />
            </div>
          </Reveal>
        );
      }}
    />
  );
}
