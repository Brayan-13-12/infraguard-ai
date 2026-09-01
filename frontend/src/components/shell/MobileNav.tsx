"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/components/AuthProvider";
import { Brand } from "@/components/Brand";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { NavList } from "@/components/shell/NavList";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navigation";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Mobile navigation drawer. Trigger + dialog live together so state is local.
 *
 * The overlay is rendered through a portal to <body> so it is never trapped by
 * an ancestor that establishes a containing block (e.g. a `backdrop-blur`
 * header), which would otherwise clip a `position: fixed` child.
 *
 * Accessibility: `role="dialog" aria-modal`, focus moves to the close button on
 * open and back to the trigger on close, Escape and backdrop close it, and the
 * page behind is scroll-locked while open. It carries navigation plus the same
 * language / theme / account / sign-out controls as the desktop sidebar.
 */
export function MobileNav() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  const email = user?.email ?? "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("a11y.openNav")}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon />
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-foreground/40 animate-fade-in"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div
                id="mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-label={t("a11y.primaryNav")}
                className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface animate-slide-in-left motion-reduce:animate-none"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                  <Brand />
                  <button
                    ref={closeRef}
                    type="button"
                    aria-label={t("a11y.closeNav")}
                    onClick={() => setOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <nav
                  aria-label={t("a11y.primaryNav")}
                  className="flex flex-1 flex-col gap-6 overflow-y-auto p-3"
                >
                  <NavList items={PRIMARY_NAV} onNavigate={() => setOpen(false)} />
                  <NavList items={SECONDARY_NAV} onNavigate={() => setOpen(false)} />
                </nav>

                <div className="shrink-0 space-y-3 border-t border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <LanguageSwitcher />
                    <ThemeToggle />
                  </div>

                  {user ? (
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
                      >
                        {initials(email)}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                        title={email}
                      >
                        {email}
                      </span>
                    </div>
                  ) : null}

                  <LogoutButton onDone={() => setOpen(false)} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
