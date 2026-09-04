"use client";

import Link from "next/link";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel } from "@/components/assets/catalog";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type { AssetType } from "@/types/asset";
import type { AssetSummary, RelationshipDetail } from "@/types/relationship";

/**
 * One relationship, shown from the perspective of the "other" asset (the
 * group heading already states the relationship type + direction). Clicking
 * the name opens the existing Asset detail route - never a re-implementation.
 */
export function RelationshipItem({
  relationship,
  other,
  canManage,
  onEdit,
  onDelete,
}: {
  relationship: RelationshipDetail;
  other: AssetSummary;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="group/rel flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5"
      title={relationship.description ?? undefined}
    >
      <Link
        href={`/assets/${other.id}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground hover:text-primary">
            {other.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {assetTypeLabel(t, other.asset_type as AssetType)}
          </span>
        </span>
        <CriticalityBadge value={other.criticality as never} />
        <AssetStatusBadge value={other.status as never} />
      </Link>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/rel:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("relationships.editAction")}
            title={t("relationships.editAction")}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("relationships.deleteAction")}
            title={t("relationships.deleteAction")}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
