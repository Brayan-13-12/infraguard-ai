"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Dialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import { RELATIONSHIP_DESCRIPTION_MAX_LENGTH } from "@/lib/config";
import { updateRelationship } from "@/services/relationships";
import type { RelationshipDetail, RelationshipType } from "@/types/relationship";

import { relationshipTypeOptions } from "./catalog";

/**
 * "Editar relación" - type and description only; source/target are immutable
 * through this dialog (§13/§21) - delete + recreate if the endpoints change.
 */
export function EditRelationshipDialog({
  relationship,
  onClose,
  onSaved,
}: {
  relationship: RelationshipDetail;
  onClose: () => void;
  onSaved: (relationship: RelationshipDetail) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<RelationshipType>(relationship.relationship_type);
  const [description, setDescription] = useState(relationship.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await updateRelationship(relationship.id, {
      relationship_type: type,
      description: description.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      onSaved(res.data);
      return;
    }
    if (res.error.kind === "duplicate") setError(t("relationships.errors.duplicate"));
    else setError(t("relationships.errors.generic"));
  }

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      title={t("relationships.edit.title")}
      size="sm"
      hideClose
      dismissable={!saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("fieldEdit.cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} loading={saving}>
            {t("fieldEdit.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("relationships.edit.summary", {
            source: relationship.source.name,
            target: relationship.target.name,
          })}
        </p>

        <Select
          label={t("relationships.add.typeLabel")}
          options={relationshipTypeOptions(t)}
          value={type}
          onChange={(e) => setType(e.target.value as RelationshipType)}
          disabled={saving}
        />

        <Textarea
          label={t("relationships.add.descriptionLabel")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={RELATIONSHIP_DESCRIPTION_MAX_LENGTH}
          disabled={saving}
          rows={2}
        />

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Dialog>
  );
}
