"use client";

import { Select } from "@/components/ui/Select";
import { useTranslation } from "@/i18n";

import {
  assetTypeOptions,
  criticalityOptions,
  environmentOptions,
  statusOptions,
} from "./catalog";

export type AssetActivityFilter = "" | "active" | "inactive";

export interface AssetFilterState {
  assetType: string;
  environment: string;
  /** Multi-value: the URL can carry several, chips render each one. */
  criticality: string[];
  status: string[];
  state: AssetActivityFilter;
}

export const EMPTY_FILTERS: AssetFilterState = {
  assetType: "",
  environment: "",
  criticality: [],
  status: [],
  state: "",
};

export function hasActiveFilters(f: AssetFilterState): boolean {
  return (
    f.assetType !== "" ||
    f.environment !== "" ||
    f.criticality.length > 0 ||
    f.status.length > 0 ||
    f.state !== ""
  );
}

/**
 * The manual filter controls. Criticality and status stay single-select here for
 * quick filtering; when the URL carries several values (e.g. from a dashboard
 * drill-down) the select shows the first and every value is a removable chip.
 */
export function AssetFilters({
  value,
  onChange,
}: {
  value: AssetFilterState;
  onChange: (next: AssetFilterState) => void;
}) {
  const { t } = useTranslation();
  const all = { value: "", label: t("filters.all") };
  const set = (patch: Partial<AssetFilterState>) => onChange({ ...value, ...patch });
  const toList = (v: string) => (v ? [v] : []);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Select
        label={t("assetFields.type")}
        value={value.assetType}
        onChange={(e) => set({ assetType: e.target.value })}
        options={[all, ...assetTypeOptions(t)]}
      />
      <Select
        label={t("assetFields.environment")}
        value={value.environment}
        onChange={(e) => set({ environment: e.target.value })}
        options={[all, ...environmentOptions(t)]}
      />
      <Select
        label={t("assetFields.criticality")}
        value={value.criticality[0] ?? ""}
        onChange={(e) => set({ criticality: toList(e.target.value) })}
        options={[all, ...criticalityOptions(t)]}
      />
      <Select
        label={t("assetFields.status")}
        value={value.status[0] ?? ""}
        onChange={(e) => set({ status: toList(e.target.value) })}
        options={[all, ...statusOptions(t)]}
      />
      <Select
        label={t("filters.state")}
        value={value.state}
        onChange={(e) => set({ state: e.target.value as AssetActivityFilter })}
        options={[
          { value: "", label: t("filters.stateAny") },
          { value: "active", label: t("filters.stateActive") },
          { value: "inactive", label: t("filters.stateInactive") },
        ]}
      />
    </div>
  );
}
