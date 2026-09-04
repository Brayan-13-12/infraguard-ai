"use client";

import Link from "next/link";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { relationshipTypeLabel } from "@/components/assets/relationships/catalog";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { ArrowRightIcon, NetworkIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type { AssetType, Environment } from "@/types/asset";
import type { AssetSummary, RelationshipDetail } from "@/types/relationship";

function EndpointLink({ asset, ariaLabel }: { asset: AssetSummary; ariaLabel: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/assets/${asset.id}`}
      aria-label={ariaLabel}
      className="group/endpoint min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="block truncate text-sm font-medium text-foreground group-hover/endpoint:text-primary">
        {asset.name}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          {assetTypeLabel(t, asset.asset_type as AssetType)} ·{" "}
          {environmentLabel(t, asset.environment as Environment)}
        </span>
        <CriticalityBadge value={asset.criticality as never} />
        <AssetStatusBadge value={asset.status as never} />
      </span>
    </Link>
  );
}

/**
 * One relationship, global-module shape: SOURCE - relation - TARGET, with a
 * visible direction cue (§10). Clicking either endpoint opens its Asset
 * detail - the row itself is never one giant link, so both endpoints and the
 * row actions stay independently reachable/clickable.
 */
export function RelationshipRow({
  relationship,
  canManage,
  onEdit,
  onDelete,
}: {
  relationship: RelationshipDetail;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const label = relationshipTypeLabel(t, relationship.relationship_type);

  return (
    <div className="group/row flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 sm:flex-row sm:items-center sm:gap-4">
      <EndpointLink
        asset={relationship.source}
        ariaLabel={`${t("dependencies.row.viewSource")}: ${relationship.source.name}`}
      />

      <div className="flex shrink-0 flex-col items-center gap-1 self-center px-1 sm:w-40">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {label}
          <ArrowRightIcon className="h-3 w-3" />
        </span>
        {relationship.description ? (
          <span
            className="max-w-[10rem] truncate text-[11px] text-muted-foreground"
            title={relationship.description}
          >
            {relationship.description}
          </span>
        ) : null}
      </div>

      <EndpointLink
        asset={relationship.target}
        ariaLabel={`${t("dependencies.row.viewTarget")}: ${relationship.target.name}`}
      />

      <div className="flex shrink-0 items-center gap-0.5 self-end opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 sm:self-center">
        <Link
          href={`/topology?asset_id=${encodeURIComponent(relationship.source_asset_id)}`}
          aria-label={t("dependencies.row.viewSourceTopology")}
          title={t("dependencies.row.viewSourceTopology")}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <NetworkIcon className="h-3.5 w-3.5" />
        </Link>
        {canManage ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
