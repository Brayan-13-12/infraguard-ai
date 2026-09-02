"use client";

import { CloseIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type {
  AssetStatus,
  AssetType,
  Criticality,
  Environment,
} from "@/types/asset";

import type { AssetFilterState } from "./AssetFilters";
import {
  assetTypeLabel,
  criticalityLabel,
  environmentLabel,
  statusLabel,
} from "./catalog";

interface Chip {
  id: string;
  /** e.g. "Criticidad" */
  field: string;
  /** e.g. "Crítica" */
  value: string;
  /** Applies the removal to the filter state / search. */
  remove: () => void;
}

/**
 * The active-filter chip row on the Assets page. The URL search params are the
 * source of truth (`AssetsBrowser` owns them); removing a chip updates the
 * filter state, which the browser writes back to the URL. Multi-value filters
 * render one removable chip per value.
 */
export function ActiveFilterChips({
  search,
  filters,
  onSearchClear,
  onChange,
  onClearAll,
}: {
  search: string;
  filters: AssetFilterState;
  onSearchClear: () => void;
  onChange: (next: AssetFilterState) => void;
  onClearAll: () => void;
}) {
  const { t } = useTranslation();
  const chips: Chip[] = [];

  if (search.trim()) {
    chips.push({
      id: "q",
      field: t("filters.chips.search"),
      value: `"${search.trim()}"`,
      remove: onSearchClear,
    });
  }
  if (filters.assetType) {
    chips.push({
      id: "type",
      field: t("assetFields.type"),
      value: assetTypeLabel(t, filters.assetType as AssetType),
      remove: () => onChange({ ...filters, assetType: "" }),
    });
  }
  if (filters.environment) {
    chips.push({
      id: "environment",
      field: t("assetFields.environment"),
      value: environmentLabel(t, filters.environment as Environment),
      remove: () => onChange({ ...filters, environment: "" }),
    });
  }
  for (const c of filters.criticality) {
    chips.push({
      id: `criticality:${c}`,
      field: t("assetFields.criticality"),
      value: criticalityLabel(t, c as Criticality),
      remove: () =>
        onChange({ ...filters, criticality: filters.criticality.filter((x) => x !== c) }),
    });
  }
  for (const s of filters.status) {
    chips.push({
      id: `status:${s}`,
      field: t("assetFields.status"),
      value: statusLabel(t, s as AssetStatus),
      remove: () => onChange({ ...filters, status: filters.status.filter((x) => x !== s) }),
    });
  }
  if (filters.state) {
    chips.push({
      id: "state",
      field: t("filters.state"),
      value:
        filters.state === "active"
          ? t("filters.stateActive")
          : t("filters.stateInactive"),
      remove: () => onChange({ ...filters, state: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("filters.chips.label")}>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface py-1 pl-2.5 pr-1 text-xs shadow-xs motion-safe:animate-scale-in"
        >
          <span className="text-muted-foreground">{chip.field}:</span>
          <span className="font-medium text-foreground">{chip.value}</span>
          <button
            type="button"
            onClick={chip.remove}
            aria-label={t("filters.chips.remove", { label: `${chip.field}: ${chip.value}` })}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:active:scale-100"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("filters.chips.clearAll")}
        </button>
      ) : null}
    </div>
  );
}
