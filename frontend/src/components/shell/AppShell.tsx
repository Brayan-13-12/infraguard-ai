import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/**
 * Authenticated application shell: a fixed sidebar on desktop (navigation +
 * account + preferences), a portalled drawer on mobile (`MobileNav`, reached
 * from the mobile-only `Topbar`), and a scrolling content column. Compose page
 * content as children; wrap the whole thing in <RequireAuth> at the route level.
 *
 * Content width is set here once for every authenticated page: a generous
 * `max-w-[1600px]` (data-heavy console, not a marketing column) with responsive
 * gutters - 16px mobile, 24px small, 32px desktop, 48px on large/ultra-wide.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 2xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
