"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import type { User } from "@/types/auth";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function AccountCard({ user }: { user: User | null }) {
  const { t, language } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.account.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="-mt-1">
          <Row label={t("dashboard.account.email")}>{user?.email ?? "—"}</Row>
          <Row label={t("dashboard.account.userId")}>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {user?.id ?? "—"}
            </code>
          </Row>
          <Row label={t("dashboard.account.status")}>
            {user ? (
              <Badge tone={user.is_active ? "success" : "danger"} dot>
                {user.is_active ? t("common.active") : t("common.inactive")}
              </Badge>
            ) : (
              "—"
            )}
          </Row>
          <Row label={t("dashboard.account.memberSince")}>
            {user
              ? new Date(user.created_at).toLocaleDateString(LANGUAGE_LOCALES[language], {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}
