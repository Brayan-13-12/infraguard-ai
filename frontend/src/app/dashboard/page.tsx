"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLogoutError(null);
    setLoggingOut(true);
    const result = await logout();
    setLoggingOut(false);
    if (result.ok) {
      router.replace("/login");
    } else {
      setLogoutError(
        result.error.kind === "unreachable"
          ? "Could not reach the server. You are still signed in."
          : "Sign out failed. You are still signed in - please try again.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">InfraGuard AI · v0.2</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </header>

      {logoutError ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {logoutError}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Your account</h2>
        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Email</dt>
          <dd>{user?.email}</dd>
          <dt className="text-slate-500 dark:text-slate-400">User ID</dt>
          <dd className="font-mono text-xs">{user?.id}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Status</dt>
          <dd>{user?.is_active ? "Active" : "Inactive"}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Member since</dt>
          <dd>{user ? new Date(user.created_at).toLocaleString() : "—"}</dd>
        </dl>
      </section>

      <p className="text-xs text-slate-400">
        Authenticated content. The rest of the InfraGuard domain (assets, incidents,
        dashboards) arrives in later phases.
      </p>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
