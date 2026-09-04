"use client";

import { useState } from "react";

import { EditRelationshipDialog } from "@/components/assets/relationships/EditRelationshipDialog";
import { relationshipTypeLabel } from "@/components/assets/relationships/catalog";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { deleteRelationship } from "@/services/relationships";
import type { RelationshipDetail, RelationshipType } from "@/types/relationship";

/** Edge inspector (§30): source/type/target/description, inline edit/delete
 * for a caller with `relationships.manage` - no navigation required. */
export function EdgeInspector({
  relationship,
  onChanged,
  onDeleted,
}: {
  relationship: RelationshipDetail;
  onChanged: (updated: RelationshipDetail) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("relationships.manage");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    const res = await deleteRelationship(relationship.id);
    setDeleting(false);
    if (!res.ok) {
      toast({ tone: "danger", description: t("relationships.errors.generic") });
      return;
    }
    toast({ tone: "success", description: t("relationships.deletedToast") });
    setConfirmingDelete(false);
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("topology.edgeInspector.title")}
        </h2>
        <p className="mt-2 text-sm text-foreground">
          <span className="font-medium">{relationship.source.name}</span>{" "}
          <span className="text-primary">
            {relationshipTypeLabel(t, relationship.relationship_type as RelationshipType)}
          </span>{" "}
          <span className="font-medium">{relationship.target.name}</span>
        </p>
      </div>

      {relationship.description ? (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
          {relationship.description}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("topology.edgeInspector.noDescription")}</p>
      )}

      {canManage ? (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon className="h-3.5 w-3.5" />
            {t("relationships.editAction")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(true)}>
            <TrashIcon className="h-3.5 w-3.5" />
            {t("relationships.deleteAction")}
          </Button>
        </div>
      ) : null}

      {editing ? (
        <EditRelationshipDialog
          relationship={relationship}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false);
            toast({ tone: "success", description: t("relationships.updatedToast") });
            onChanged(updated);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void confirmDelete()}
        title={t("relationships.deleteConfirmTitle")}
        description={t("relationships.deleteConfirmBody", {
          source: relationship.source.name,
          type: relationshipTypeLabel(t, relationship.relationship_type as RelationshipType),
          target: relationship.target.name,
        })}
        confirmLabel={t("relationships.deleteAction")}
        tone="danger"
        loading={deleting}
      />
    </div>
  );
}
