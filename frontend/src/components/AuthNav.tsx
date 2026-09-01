"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { useTranslation } from "@/i18n";

export function AuthNav() {
  const { status, user } = useAuth();
  const { t } = useTranslation();

  if (status === "loading") {
    return <Spinner label={t("landing.loadingAccount")} className="text-muted-foreground" />;
  }

  if (status === "authenticated") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden max-w-[12rem] truncate text-muted-foreground sm:inline">
          {user?.email}
        </span>
        <Link href="/dashboard" className={buttonClasses({ size: "sm" })}>
          {t("landing.openDashboard")} <ArrowRightIcon />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("landing.signIn")}
      </Link>
      <Link href="/register" className={buttonClasses({ size: "sm" })}>
        {t("landing.createAccount")}
      </Link>
    </div>
  );
}
