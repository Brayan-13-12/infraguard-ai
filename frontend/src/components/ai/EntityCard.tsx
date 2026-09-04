"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { BoxIcon, ChevronRightIcon, HistoryIcon, ShieldIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type { AIEntityRef } from "@/types/ai";

import { entityHref } from "./entityHref";

const ICON = {
  asset: BoxIcon,
  incident: ShieldIcon,
  audit_event: HistoryIcon,
} as const;

/**
 * Compact native card for an entity an answer referenced. It reuses the
 * existing detail-workspace route - it never re-implements AssetDetail /
 * IncidentDetail.
 */
export function EntityCard({ entity }: { entity: AIEntityRef }) {
  const { t } = useTranslation();
  const href = entityHref(entity);
  const Icon = ICON[entity.type];
  const cta =
    entity.type === "asset"
      ? t("ai.card.viewAsset")
      : entity.type === "incident"
        ? t("ai.card.viewIncident")
        : t("ai.card.viewAuditEvent");

  const inner = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {entity.label}
        </span>
        <span className="text-xs text-muted-foreground">{cta}</span>
      </span>
      {href ? <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
    </div>
  );

  const className =
    "block w-full rounded-lg border border-border bg-surface p-2.5 text-left transition-colors";

  if (!href) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          {inner}
          <Badge tone="neutral">{entity.type}</Badge>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`${className} hover:border-primary/40 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      {inner}
    </Link>
  );
}
