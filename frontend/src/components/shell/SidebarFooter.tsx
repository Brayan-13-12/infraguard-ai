"use client";

import { useAuth } from "@/components/AuthProvider";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Bottom region of the navigation rail. `shrink-0`, always visible.
 *
 * Expanded: identity row (avatar + email + theme toggle) over the
 * confirmation-gated "Salir". Collapsed: a centered avatar, theme icon and a
 * logout icon that opens a confirmation dialog. The language switcher was
 * removed (the UI is Spanish-only).
 */
export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const email = user?.email ?? "";

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-sidebar-border p-2">
        <span
          title={email || undefined}
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
        >
          {email ? initials(email) : "··"}
        </span>
        <ThemeToggle />
        <LogoutButton collapsed />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <div className={cn("mb-2 flex items-center gap-2.5 rounded-lg px-1 py-1")}>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
        >
          {email ? initials(email) : "··"}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          title={email ? `${t("shell.signedInAs")} ${email}` : undefined}
        >
          {email || "—"}
        </span>
        <ThemeToggle />
      </div>

      <LogoutButton />
    </div>
  );
}
