import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/**
 * Authenticated application shell.
 *
 * The shell owns the viewport: the outer frame is `h-[100dvh] overflow-hidden`,
 * so the document/body never scrolls. The navigation rail is a full-height
 * flex child (visually continuous top-to-bottom on any page length), and the
 * **main pane** is the scroll container (`overflow-y-auto`). Mobile keeps the
 * portalled drawer (`MobileNav` from `Topbar`).
 *
 * Content width is set here once: a generous `max-w-[1600px]` with responsive
 * gutters - 16px mobile, 24px small, 32px desktop, 48px on large/ultra-wide.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          data-scroll-lock
          className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        >
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 2xl:px-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
