"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { RestoreIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "@/i18n";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { notifyTrashChanged } from "@/lib/trashRefresh";
import { restoreTrashAsset, restoreTrashIncident } from "@/services/trash";

/**
 * The primary Trash action: restore an item behind a {@link ConfirmDialog}.
 * On success it tells the Trash list *and* the operational list to refetch,
 * toasts, and calls `onRestored` (the workspace closes; the full page navigates
 * back to `/trash`). Restore is the only mutation Trash exposes - there is no
 * permanent delete in this milestone.
 */
export function RestoreAction({
  kind,
  id,
  label,
  onRestored,
  size = "sm",
}: {
  kind: "assets" | "incidents";
  id: string;
  /** The record's name / title, for the confirm copy. */
  label: string;
  onRestored: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAsset = kind === "assets";

  async function run() {
    setBusy(true);
    setError(null);
    const res = isAsset ? await restoreTrashAsset(id) : await restoreTrashIncident(id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      notifyTrashChanged({ scope: kind });
      if (isAsset) notifyAssetsChanged();
      else notifyIncidentsChanged();
      toast({
        tone: "success",
        description: isAsset
          ? t("trashDetail.restoredAssetToast")
          : t("trashDetail.restoredIncidentToast"),
      });
      onRestored();
    } else {
      setError(t("trashDetail.restoreError"));
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <RestoreIcon className="h-3.5 w-3.5" />
        {t("trashDetail.restore")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={
          isAsset ? t("trashDetail.restoreAssetTitle") : t("trashDetail.restoreIncidentTitle")
        }
        description={
          isAsset
            ? t("trashDetail.restoreAssetBody", { name: label })
            : t("trashDetail.restoreIncidentBody", { title: label })
        }
        confirmLabel={t("trashDetail.restoreConfirm")}
        tone="primary"
        loading={busy}
        error={error}
      />
    </>
  );
}
