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
  criticality: string;
  status: string;
  state: AssetActivityFilter;
}

export const EMPTY_FILTERS: AssetFilterState = {
  assetType: "",
  environment: "",
  criticality: "",
  status: "",
  state: "",
};

export function hasActiveFilters(f: AssetFilterState): boolean {
  return (
    f.assetType !== "" ||
    f.environment !== "" ||
    f.criticality !== "" ||
    f.status !== "" ||
    f.state !== ""
  );
}

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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
        value={value.criticality}
        onChange={(e) => set({ criticality: e.target.value })}
        options={[all, ...criticalityOptions(t)]}
      />
      <Select
        label={t("assetFields.status")}
        value={value.status}
        onChange={(e) => set({ status: e.target.value })}
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
