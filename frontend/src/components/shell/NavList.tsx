"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LockIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavItem } from "@/lib/navigation";

/**
 * Flat navigation for the shell (desktop rail + mobile drawer). No section
 * headings. The active item gets a primary-tinted fill, primary text/icon and a
 * left accent bar (`aria-current="page"`). "Soon" items are `aria-disabled`,
 * not links, with a quiet lock marker and a "Próximamente" tooltip.
 *
 * When `collapsed`, rows are icon-only with the label exposed as the accessible
 * name plus a hover/focus tooltip.
 */
export function NavList({
  items = NAV_ITEMS,
  collapsed = false,
  onNavigate,
}: {
  items?: NavItem[];
  collapsed?: boolean;
  /** Called after an enabled item is activated (closes the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const row = cn(
    "group/nav relative flex items-center rounded-lg text-sm transition-[color,background-color] duration-150",
    collapsed ? "h-10 w-10 justify-center" : "gap-3 px-3 py-2",
  );

  return (
    <ul className={cn("flex flex-col gap-1", collapsed && "items-center")}>
      {items.map(({ label, href, icon: Icon, status }) => {
        if (status === "soon") {
          return (
            <li key={href}>
              <span
                aria-disabled="true"
                title={t("a11y.comingSoon")}
                className={cn(row, "cursor-default text-muted-foreground/55")}
              >
                <Icon className="shrink-0" />
                {!collapsed ? (
                  <>
                    <span className="flex-1 truncate">{label}</span>
                    <LockIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  </>
                ) : null}
                {collapsed ? <NavTooltip label={`${label} · ${t("a11y.comingSoon")}`} /> : null}
              </span>
            </li>
          );
        }

        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              onClick={onNavigate}
              className={cn(
                row,
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary/12 font-semibold text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:content-['']"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "shrink-0 transition-colors",
                  !active && "text-muted-foreground group-hover/nav:text-foreground",
                )}
              />
              {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
              {collapsed ? <NavTooltip label={label} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Hover/focus label for a collapsed rail item. Decorative - the accessible
 *  name is already on the link/span via `aria-label` / `title`. */
function NavTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-md transition-opacity duration-100 group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100"
    >
      {label}
    </span>
  );
}
