import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/**
 * Authenticated application shell: a fixed sidebar on desktop (navigation +
 * account + preferences), a portalled drawer on mobile (`MobileNav`, reached
 * from the mobile-only `Topbar`), and a scrolling content column. Compose page
 * content as children; wrap the whole thing in <RequireAuth> at the route level.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
