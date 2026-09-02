import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";

/**
 * Shared layout for authenticated application pages. Provides the client-side
 * auth guard + the app shell once, so pages under `(app)` don't repeat them.
 * The route group `(app)` does not appear in the URL.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
