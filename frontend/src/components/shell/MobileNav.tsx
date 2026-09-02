"use client";

import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Brand } from "@/components/Brand";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { NavList } from "@/components/shell/NavList";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { Drawer } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Mobile navigation drawer. Trigger + drawer live together so state is local.
 * The drawer behaviour (portal, backdrop, Escape, focus trap + restore, scroll
 * lock) comes from the shared {@link Drawer} / Overlay primitive. It mirrors the
 * grouped desktop navigation plus the same theme / account / sign-out controls.
 */
export function MobileNav() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const email = user?.email ?? "";

  return (
    <>
      <button
        type="button"
        aria-label={t("a11y.openNav")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon />
      </button>

      <Drawer
        open={open}
        onClose={close}
        side="left"
        showClose={false}
        label={t("a11y.primaryNav")}
        className="max-w-[19rem] bg-sidebar"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <Brand />
          <button
            type="button"
            aria-label={t("a11y.closeNav")}
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CloseIcon />
          </button>
        </div>

        <nav
          aria-label={t("a11y.primaryNav")}
          className="flex flex-1 flex-col overflow-y-auto p-3"
        >
          <NavList onNavigate={close} />
        </nav>

        <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
            >
              {email ? initials(email) : "··"}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
              title={email}
            >
              {email || "—"}
            </span>
            <ThemeToggle />
          </div>

          <LogoutButton onDone={close} />
        </div>
      </Drawer>
    </>
  );
}
