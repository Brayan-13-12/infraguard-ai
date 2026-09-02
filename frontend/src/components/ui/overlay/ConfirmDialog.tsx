"use client";

import { type ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";

import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  /** Confirm is in flight - buttons disable and the confirm button shows a spinner. */
  loading?: boolean;
  /** Error text shown above the actions; does not close the dialog. */
  error?: string | null;
}

/**
 * Confirmation modal built on {@link Dialog}. Explicit two-button flow (no
 * header close button). The confirm action stays enabled/disabled via `loading`
 * so the caller controls the async lifecycle and can surface `error` in place.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  loading = false,
  error = null,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      hideClose
      dismissable={!loading}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger">
          <p>{error}</p>
        </Alert>
      ) : null}
    </Dialog>
  );
}
