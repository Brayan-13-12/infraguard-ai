"use client";

import { useAuth } from "@/components/AuthProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTranslation } from "@/i18n";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Bottom region of the desktop sidebar: language, theme, the signed-in identity
 * and sign-out. These moved here from the old topbar so the authenticated shell
 * has a single, quiet home for account + preferences.
 */
export function SidebarFooter() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const email = user?.email ?? "";

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-2.5 px-1">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
        >
          {email ? initials(email) : "··"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("shell.signedInAs")}
          </span>
          <span
            className="block truncate text-sm font-medium text-foreground"
            title={email}
          >
            {email || "—"}
          </span>
        </span>
      </div>

      <LogoutButton />
    </div>
  );
}
