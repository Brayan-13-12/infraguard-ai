"use client";

import { useState } from "react";

import { relationshipTypeOptions } from "@/components/assets/relationships/catalog";
import {
  assetTypeOptions,
  criticalityOptions,
  environmentOptions,
} from "@/components/assets/catalog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ChevronDownIcon, FilterIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

export interface DependenciesFilterState {
  relationshipType: string;
  environment: string;
  criticality: string;
  assetType: string;
}

export const EMPTY_DEPENDENCIES_FILTERS: DependenciesFilterState = {
  relationshipType: "",
  environment: "",
  criticality: "",
  assetType: "",
};

/**
 * Collapsible filter panel (§13) - minimum viable set (type/environment) plus
 * criticality/asset type, never a permanent form. Environment/criticality/
 * asset type match *either* endpoint in the global module (§21 backend note).
 */
export function DependenciesFilters({
  value,
  onChange,
}: {
  value: DependenciesFilterState;
  onChange: (next: DependenciesFilterState) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const activeCount = [
    value.relationshipType !== "",
    value.environment !== "",
    value.criticality !== "",
    value.assetType !== "",
  ].filter(Boolean).length;

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FilterIcon className="h-4 w-4" />
        {t("dependencies.filters.trigger")}
        {activeCount > 0 ? (
          <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {activeCount}
          </span>
        ) : null}
        <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-border bg-surface p-4 shadow-lg">
          <div className="flex flex-col gap-3">
            <Select
              label={t("dependencies.filters.relationshipType")}
              value={value.relationshipType}
              onChange={(e) => onChange({ ...value, relationshipType: e.target.value })}
              options={[
                { value: "", label: t("dependencies.filters.any") },
                ...relationshipTypeOptions(t),
              ]}
            />
            <Select
              label={t("dependencies.filters.environment")}
              value={value.environment}
              onChange={(e) => onChange({ ...value, environment: e.target.value })}
              options={[{ value: "", label: t("dependencies.filters.any") }, ...environmentOptions(t)]}
            />
            <Select
              label={t("dependencies.filters.criticality")}
              value={value.criticality}
              onChange={(e) => onChange({ ...value, criticality: e.target.value })}
              options={[{ value: "", label: t("dependencies.filters.any") }, ...criticalityOptions(t)]}
            />
            <Select
              label={t("dependencies.filters.assetType")}
              value={value.assetType}
              onChange={(e) => onChange({ ...value, assetType: e.target.value })}
              options={[{ value: "", label: t("dependencies.filters.any") }, ...assetTypeOptions(t)]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(EMPTY_DEPENDENCIES_FILTERS)}
              disabled={activeCount === 0}
            >
              {t("dependencies.filters.reset")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
