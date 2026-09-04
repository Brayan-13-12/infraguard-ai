"use client";

import { useState } from "react";

import { relationshipTypeOptions } from "@/components/assets/relationships/catalog";
import { criticalityOptions, environmentOptions, statusOptions } from "@/components/assets/catalog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ChevronDownIcon, FilterIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { TopologyDirection } from "@/types/topology";

export interface TopologyFilterState {
  depth: number;
  direction: TopologyDirection;
  relationshipType: string;
  environment: string;
  criticality: string;
  status: string;
}

export const EMPTY_FILTERS: TopologyFilterState = {
  depth: 1,
  direction: "both",
  relationshipType: "",
  environment: "",
  criticality: "",
  status: "",
};

/** Collapsible filter panel (§31) - never a permanent form covering the graph. */
export function TopologyFilters({
  value,
  onChange,
}: {
  value: TopologyFilterState;
  onChange: (next: TopologyFilterState) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const activeCount = [
    value.direction !== "both",
    value.relationshipType !== "",
    value.environment !== "",
    value.criticality !== "",
    value.status !== "",
  ].filter(Boolean).length;

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FilterIcon className="h-4 w-4" />
        {t("topology.filters.trigger")}
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
              label={t("topology.filters.direction")}
              value={value.direction}
              onChange={(e) => onChange({ ...value, direction: e.target.value as TopologyDirection })}
              options={[
                { value: "both", label: t("topology.filters.directionBoth") },
                { value: "upstream", label: t("topology.filters.directionUpstream") },
                { value: "downstream", label: t("topology.filters.directionDownstream") },
              ]}
            />
            <Select
              label={t("topology.filters.depth")}
              value={String(value.depth)}
              onChange={(e) => onChange({ ...value, depth: Number(e.target.value) })}
              options={[1, 2, 3].map((d) => ({ value: String(d), label: String(d) }))}
            />
            <Select
              label={t("topology.filters.relationshipType")}
              value={value.relationshipType}
              onChange={(e) => onChange({ ...value, relationshipType: e.target.value })}
              options={[
                { value: "", label: t("topology.filters.any") },
                ...relationshipTypeOptions(t),
              ]}
            />
            <Select
              label={t("topology.filters.environment")}
              value={value.environment}
              onChange={(e) => onChange({ ...value, environment: e.target.value })}
              options={[{ value: "", label: t("topology.filters.any") }, ...environmentOptions(t)]}
            />
            <Select
              label={t("topology.filters.criticality")}
              value={value.criticality}
              onChange={(e) => onChange({ ...value, criticality: e.target.value })}
              options={[{ value: "", label: t("topology.filters.any") }, ...criticalityOptions(t)]}
            />
            <Select
              label={t("topology.filters.status")}
              value={value.status}
              onChange={(e) => onChange({ ...value, status: e.target.value })}
              options={[{ value: "", label: t("topology.filters.any") }, ...statusOptions(t)]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(EMPTY_FILTERS)}
              disabled={activeCount === 0 && value.depth === 1}
            >
              {t("topology.filters.reset")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
