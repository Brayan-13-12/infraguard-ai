"use client";

import Link from "next/link";

import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import { LANGUAGE_LOCALES } from "@/i18n";
import type { AdminUserListItem } from "@/types/rbac";

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function RoleChips({ roles }: { roles: AdminUserListItem["roles"] }) {
  const { t } = useTranslation();
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">{t("admin.common.noRoles")}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r.id} tone={r.slug === "administrator" ? "info" : "neutral"}>
          {r.name}
        </Badge>
      ))}
    </div>
  );
}

export function UsersList({ items }: { items: AdminUserListItem[] }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Desktop table */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">{t("admin.users.columns.email")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.users.columns.status")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.users.columns.roles")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.users.columns.joined")}</th>
            <th className="px-4 py-2.5 text-right font-medium sr-only">actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((u) => (
            <tr key={u.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {u.email}
                </Link>
              </td>
              <td className="px-4 py-3">
                <AccountStatusBadge status={u.account_status} />
              </td>
              <td className="px-4 py-3">
                <RoleChips roles={u.roles} />
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {formatDate(u.created_at, locale)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/users/${u.id}`}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  {t("admin.common.manage")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-border sm:hidden">
        {items.map((u) => (
          <li key={u.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/admin/users/${u.id}`}
                className="min-w-0 truncate font-medium text-foreground hover:underline"
              >
                {u.email}
              </Link>
              <AccountStatusBadge status={u.account_status} />
            </div>
            <RoleChips roles={u.roles} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDate(u.created_at, locale)}</span>
              <Link
                href={`/admin/users/${u.id}`}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                {t("admin.common.manage")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
