"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { LockIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/**
 * The 403 state - shown when an **authenticated** user reaches a section or
 * action their roles do not grant. It is *not* an error and *not* a sign-in
 * prompt: the user is signed in, they simply lack the permission. Direct
 * navigation to a forbidden route lands here; it never redirects to /login.
 */
export function Forbidden({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();

  const body = (
    <EmptyState
      icon={<LockIcon />}
      title={t("forbidden.title")}
      description={t("forbidden.body")}
      action={
        compact ? undefined : (
          <Link href="/dashboard" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            {t("forbidden.backToDashboard")}
          </Link>
        )
      }
    />
  );

  return compact ? body : <Reveal>{body}</Reveal>;
}
