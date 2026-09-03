"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import type { RoleListItem } from "@/types/rbac";

function TypeBadge({ system }: { system: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge tone={system ? "info" : "neutral"}>
      {system ? t("admin.common.system") : t("admin.common.custom")}
    </Badge>
  );
}

export function RolesList({ items }: { items: RoleListItem[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">{t("admin.roles.columns.name")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.roles.columns.type")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.roles.columns.users")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.roles.columns.permissions")}</th>
            <th className="px-4 py-2.5 text-right font-medium sr-only">actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((r) => (
            <tr key={r.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/roles/${r.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {r.name}
                </Link>
                {r.description ? (
                  <p className="max-w-md truncate text-xs text-muted-foreground">
                    {r.description}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <TypeBadge system={r.is_system} />
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.user_count}</td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {r.permission_count}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/roles/${r.id}`}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  {t("admin.common.view")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border sm:hidden">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/admin/roles/${r.id}`}
                className="min-w-0 truncate font-medium text-foreground hover:underline"
              >
                {r.name}
              </Link>
              <TypeBadge system={r.is_system} />
            </div>
            {r.description ? (
              <p className="text-xs text-muted-foreground">{r.description}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {r.user_count === 1
                ? t("admin.roles.userCountOne")
                : t("admin.roles.userCount", { count: r.user_count })}
              {" · "}
              {r.permission_count === 1
                ? t("admin.roles.permissionCountOne")
                : t("admin.roles.permissionCount", { count: r.permission_count })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
