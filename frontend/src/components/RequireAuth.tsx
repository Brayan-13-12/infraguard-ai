"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";

/**
 * Client-side route guard. The API is the source of truth for authentication;
 * this only decides what to render while / after that check resolves.
 *
 * A brief "Checking your session…" state is shown before an unauthenticated
 * visitor is redirected to /login. Server-side gating would require the frontend
 * and API to be same-origin (a reverse proxy) - a deployment-phase concern.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div
      role="status"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {status === "loading" ? "Checking your session…" : "Redirecting to sign in…"}
      </p>
      {error ? <p className="text-xs text-amber-600">{error}</p> : null}
    </div>
  );
}
