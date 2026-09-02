import { Brand } from "@/components/Brand";
import { MobileNav } from "@/components/shell/MobileNav";

/**
 * Mobile-only header: the drawer trigger plus the brand. It sits above the
 * scrolling main pane (`AppShell` owns the scroll), so it stays put while the
 * content scrolls. On `lg+` the rail carries navigation and this bar is hidden.
 */
export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 lg:hidden">
      <MobileNav />
      <Brand />
    </header>
  );
}
