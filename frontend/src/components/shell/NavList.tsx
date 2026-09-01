"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";

const ROW =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

export function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  /** Called after an enabled item is activated (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ label, href, icon: Icon, status }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        if (status === "soon") {
          return (
            <li key={href}>
              <span
                aria-disabled="true"
                className={cn(ROW, "cursor-not-allowed text-muted-foreground/70")}
              >
                <Icon className="shrink-0" />
                {/* Module name and status marker stay English in every locale. */}
                <span className="flex-1 truncate">{label}</span>
                <Badge tone="neutral" className="text-[10px]">
                  Coming soon
                </Badge>
              </span>
            </li>
          );
        }

        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                ROW,
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
