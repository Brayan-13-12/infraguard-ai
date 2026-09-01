"use client";

import { Brand } from "@/components/Brand";
import { NavList } from "@/components/shell/NavList";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { useTranslation } from "@/i18n";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navigation";

/** Desktop sidebar. Hidden below `lg` - the mobile drawer takes over there. */
export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Brand />
      </div>
      <nav
        aria-label={t("a11y.primaryNav")}
        className="flex flex-1 flex-col gap-6 overflow-y-auto p-3"
      >
        <NavList items={PRIMARY_NAV} />
        <div className="mt-auto">
          <NavList items={SECONDARY_NAV} />
        </div>
      </nav>
      <SidebarFooter />
    </aside>
  );
}
