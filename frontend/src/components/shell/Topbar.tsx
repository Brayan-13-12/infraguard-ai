import { Brand } from "@/components/Brand";
import { MobileNav } from "@/components/shell/MobileNav";

/**
 * Mobile-only header: the drawer trigger plus the brand. On `lg+` the sidebar
 * carries navigation, account and preferences, so this bar is hidden and the
 * content column starts at the top of the viewport.
 */
export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
      <MobileNav />
      <Brand />
    </header>
  );
}
