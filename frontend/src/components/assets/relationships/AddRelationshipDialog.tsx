"use client";

import { useState } from "react";

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

import { relationshipTypeOptions } from "./catalog";
import { RelationshipAssetPicker } from "./RelationshipAssetPicker";

/**
 * "+ Añadir relación" - a centered dialog. The source asset is fixed (the
 * Asset detail this tab belongs to); only type, target and an optional
 * description are collected.
 */
export function AddRelationshipDialog({
  sourceAsset,
  onClose,
  onCreated,
}: {
  sourceAsset: Asset;
  onClose: () => void;
  onCreated: (relationship: RelationshipDetail) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<RelationshipType>("depends_on");
  const [target, setTarget] = useState<Asset | null>(null);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeOptions = relationshipTypeOptions(t);

  async function submit() {
    if (!target) {
      setError(t("relationships.add.errorNoTarget"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createRelationship({
      source_asset_id: sourceAsset.id,
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
      title={t("relationships.add.title")}
      size="md"
      hideClose
      dismissable={!saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("fieldEdit.cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} loading={saving}>
            {t("relationships.add.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-sm font-medium text-foreground">
            {t("relationships.add.sourceLabel")}
          </span>
          <p className="mt-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {sourceAsset.name}
          </p>
        </div>

        <Select
          label={t("relationships.add.typeLabel")}
          options={typeOptions}
          value={type}
          onChange={(e) => setType(e.target.value as RelationshipType)}
          disabled={saving}
        />

        <RelationshipAssetPicker
          value={target}
          onChange={setTarget}
          excludeId={sourceAsset.id}
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
