"use client";

import { NetworkIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type { Asset } from "@/types/asset";

import { TopologySearch } from "./TopologySearch";

/** No broken empty canvas (§55): a clear message plus the same search used
 * in the toolbar, so the empty state is immediately actionable. */
export function EmptyTopology({
  kind,
  onSelect,
}: {
  kind: "no-focus" | "not-found" | "no-relationships";
  onSelect: (asset: Asset) => void;
}) {
  const { t } = useTranslation();
  const title =
    kind === "no-focus"
      ? t("topology.empty.noFocusTitle")
      : kind === "not-found"
        ? t("topology.empty.notFoundTitle")
        : t("topology.empty.noRelationshipsTitle");
  const body =
    kind === "no-focus"
      ? t("topology.empty.noFocusBody")
      : kind === "not-found"
        ? t("topology.empty.notFoundBody")
        : t("topology.empty.noRelationshipsBody");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <NetworkIcon className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      <TopologySearch onSelect={onSelect} />
    </div>
  );
}
