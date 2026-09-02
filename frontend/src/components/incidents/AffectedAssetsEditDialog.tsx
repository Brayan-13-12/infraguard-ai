"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { type FieldSaveResult } from "@/components/ui/FieldEditDialog";
import { Dialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import type { IncidentDetail } from "@/types/incident";

import { IncidentAssetPicker } from "./IncidentAssetPicker";

/**
 * Focused editor for an incident's affected-asset set. Reuses the same
 * Cancelar / Guardar + inline-error shell as {@link FieldEditDialog}; a separate
 * component only because its value shape (`string[]`) and control (the picker)
 * differ fundamentally from the scalar fields. Saving reconciles the
 * relationship server-side, which generates the ASSET_ADDED / ASSET_REMOVED
 * timeline events.
 */
export function AffectedAssetsEditDialog({
  incident,
  onClose,
  onSave,
}: {
  incident: IncidentDetail;
  onClose: () => void;
  onSave: (assetIds: string[]) => Promise<FieldSaveResult>;
}) {
  const { t } = useTranslation();
  const [ids, setIds] = useState<string[]>(incident.affected_assets.map((a) => a.id));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await onSave(ids);
    setSaving(false);
    if (res.ok) onClose();
    else setError(res.error);
  }

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      title={t("incidentDetail.editAffectedTitle")}
      size="md"
      hideClose
      dismissable={!saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("fieldEdit.cancel")}
          </Button>
          <Button size="sm" onClick={() => void save()} loading={saving}>
            {t("fieldEdit.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <IncidentAssetPicker
          value={ids}
          onChange={setIds}
          hideLabel
          disabled={saving}
          seed={incident.affected_assets.map((a) => ({
            id: a.id,
            name: a.name,
            asset_type: a.asset_type,
            environment: a.environment,
            criticality: a.criticality,
          }))}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Dialog>
  );
}
