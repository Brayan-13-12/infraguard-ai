"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LogOutIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";

/**
 * Confirmation-gated sign-out, shared by the rail and the mobile drawer.
 *
 * The safe behaviour is unchanged: the destructive action is never one stray
 * tap away, and session state is only cleared when `logout()` resolves
 * `{ ok: true }` (the HttpOnly cookie is authoritative). Any failure keeps the
 * session and surfaces a message.
 *
 * `collapsed` swaps the inline Confirm/Cancel step for an icon button that opens
 * a {@link ConfirmDialog} (the icon rail has no room for the inline step).
 */
export function LogoutButton({
  onDone,
  collapsed = false,
}: {
  onDone?: () => void;
  collapsed?: boolean;
}) {
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

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          aria-label={t("shell.logout")}
          title={t("shell.logout")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <LogOutIcon />
        </button>
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void handleLogout()}
          title={t("shell.logoutConfirmTitle")}
          confirmLabel={t("shell.logout")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={loggingOut}
          error={error}
        />
      </>
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
