import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";

/**
 * The one place that composes the client-side auth guard with the app shell.
 * Used by the `(app)` route-group layout so authenticated pages don't each
 * repeat `<RequireAuth><AppShell>`.
 */
export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
