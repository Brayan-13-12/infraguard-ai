"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/Brand";
import { NavList } from "@/components/shell/NavList";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { PanelLeftIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "infraguard.sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Desktop navigation rail. Hidden below `lg` - the mobile drawer takes over.
 *
 * A viewport-height flex column (the shell owns the scroll, not the document, so
 * the rail is visually continuous top-to-bottom no matter how tall the page is).
 * Collapsible to an icon rail; the choice is a non-sensitive UI preference kept
 * in `localStorage`. Brand + footer are `shrink-0`; only the nav scrolls.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [ready, setReady] = useState(false);

  // Enable the width transition only after mount so a stored "collapsed" does
  // not animate on a cold load.
  useEffect(() => setReady(true), []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* preference is best-effort */
      }
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        collapsed ? "w-[4.25rem]" : "w-64",
        ready && "transition-[width] duration-200 ease-out motion-reduce:transition-none",
      )}
    >
      {/* Brand + collapse control */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "gap-2.5 px-4",
        )}
      >
        <BrandMark />
        {!collapsed ? (
          <>
            <span className="flex-1 truncate text-sm font-semibold tracking-tight text-foreground">
              InfraGuard AI
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={t("a11y.collapseNav")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <PanelLeftIcon />
            </button>
          </>
        ) : null}
      </div>

      {collapsed ? (
        <div className="flex shrink-0 justify-center border-b border-sidebar-border py-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={t("a11y.expandNav")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <PanelLeftIcon />
          </button>
        </div>
      ) : null}

      <nav
        aria-label={t("a11y.primaryNav")}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          // Collapsed: never scrolls (5 items), so tooltips can escape the rail.
          collapsed ? "overflow-visible px-2 py-3" : "overflow-y-auto p-3",
        )}
      >
        <NavList collapsed={collapsed} />
      </nav>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
