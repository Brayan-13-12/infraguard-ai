"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LogOutIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/**
 * Confirmation-gated sign-out, shared by the sidebar and the mobile drawer.
 *
 * A first click arms an explicit Confirm / Cancel step - the destructive action
 * is never one stray tap away. State is only cleared when `logout()` resolves
 * `{ ok: true }` (the HttpOnly cookie is authoritative); any failure keeps the
 * session and surfaces a message.
 */
export function LogoutButton({ onDone }: { onDone?: () => void }) {
  const { logout } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);
    setLoggingOut(true);
    const result = await logout();
    setLoggingOut(false);
    if (result.ok) {
      onDone?.();
      router.replace("/login");
      return;
    }
    setConfirming(false);
    setError(
      result.error.kind === "unreachable"
        ? t("shell.logoutErrorUnreachable")
        : t("shell.logoutErrorGeneric"),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {confirming ? (
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            fullWidth
            loading={loggingOut}
            onClick={handleLogout}
          >
            {loggingOut ? t("shell.loggingOut") : t("shell.confirmLogout")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={loggingOut}
          >
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => setConfirming(true)}
          className="justify-start"
        >
          <LogOutIcon />
          {t("shell.logout")}
        </Button>
      )}
    </div>
  );
}
