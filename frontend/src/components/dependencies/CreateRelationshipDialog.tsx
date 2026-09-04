"use client";

import { useState } from "react";

import { RelationshipAssetPicker } from "@/components/assets/relationships/RelationshipAssetPicker";
import { relationshipTypeOptions } from "@/components/assets/relationships/catalog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Dialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";
import { RELATIONSHIP_DESCRIPTION_MAX_LENGTH } from "@/lib/config";
import { createRelationship } from "@/services/relationships";
import type { Asset } from "@/types/asset";
import type { RelationshipDetail, RelationshipType } from "@/types/relationship";

/**
 * "+ Nueva relación" from the global Dependencias module (§11) - unlike the
 * Asset-detail dialog, BOTH endpoints are selectable here. Reuses the same
 * {@link RelationshipAssetPicker} twice (source label overridden) rather than
 * duplicating the picker implementation.
 */
export function CreateRelationshipDialog({
  initialSource,
  onClose,
  onCreated,
}: {
  /** Pre-fills the source when opened from an asset-filtered view. */
  initialSource?: Asset | null;
  onClose: () => void;
  onCreated: (relationship: RelationshipDetail) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Asset | null>(initialSource ?? null);
  const [target, setTarget] = useState<Asset | null>(null);
  const [type, setType] = useState<RelationshipType>("depends_on");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeSource(next: Asset | null) {
    setSource(next);
    // The target picker already excludes the *current* source from its
    // results, but a source change after a target was chosen can turn an
    // already-selected target into the (now) invalid same-asset pair (§12).
    if (next && target && next.id === target.id) setTarget(null);
  }

  async function submit() {
    if (!source) {
      setError(t("dependencies.create.errorNoSource"));
      return;
    }
    if (!target) {
      setError(t("relationships.add.errorNoTarget"));
      return;
    }
    if (source.id === target.id) {
      setError(t("dependencies.create.errorSameAsset"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createRelationship({
      source_asset_id: source.id,
      target_asset_id: target.id,
      relationship_type: type,
      description: description.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      onCreated(res.data);
      return;
    }
    if (res.error.kind === "duplicate") setError(t("relationships.errors.duplicate"));
    else if (res.error.kind === "asset_trashed") setError(t("relationships.errors.assetTrashed"));
    else if (res.error.kind === "not_found") setError(t("relationships.errors.notFound"));
    else setError(t("relationships.errors.generic"));
  }

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      title={t("dependencies.create.title")}
      size="md"
      hideClose
      dismissable={!saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("fieldEdit.cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} loading={saving}>
            {t("dependencies.create.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RelationshipAssetPicker
          value={source}
          onChange={changeSource}
          excludeId={target?.id}
          disabled={saving}
          label={t("relationships.add.sourceLabel")}
        />

        <Select
          label={t("relationships.add.typeLabel")}
          options={relationshipTypeOptions(t)}
          value={type}
          onChange={(e) => setType(e.target.value as RelationshipType)}
          disabled={saving}
        />

        <RelationshipAssetPicker
          value={target}
          onChange={setTarget}
          excludeId={source?.id}
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
