"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui/Spinner";
import { useTranslation } from "@/i18n";

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
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Spinner decorative />
      <p className="text-sm text-muted-foreground">
        {status === "loading" ? t("guard.checkingSession") : t("guard.redirecting")}
      </p>
      {error ? <p className="text-xs text-warning">{error}</p> : null}
    </div>
  );
}
