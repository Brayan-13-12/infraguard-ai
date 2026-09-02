"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useTranslation } from "@/i18n";

import {
  incidentStatusOptions,
  priorityOptions,
  severityOptions,
} from "./catalog";

export interface IncidentFilterState {
  severity: string[];
  status: string[];
  priority: string[];
  /** Set from the URL (?asset_id=…) - shown as a removable chip, no select. */
  assetId: string;
  startedFrom: string;
  startedTo: string;
}

export const EMPTY_INCIDENT_FILTERS: IncidentFilterState = {
  severity: [],
  status: [],
  priority: [],
  assetId: "",
  startedFrom: "",
  startedTo: "",
};

export function hasActiveIncidentFilters(f: IncidentFilterState): boolean {
  return (
    f.severity.length > 0 ||
    f.status.length > 0 ||
    f.priority.length > 0 ||
    f.assetId !== "" ||
    f.startedFrom !== "" ||
    f.startedTo !== ""
  );
}

export function IncidentFilters({
  value,
  onChange,
}: {
  value: IncidentFilterState;
  onChange: (next: IncidentFilterState) => void;
}) {
  const { t } = useTranslation();
  const all = { value: "", label: t("filters.all") };
  const set = (patch: Partial<IncidentFilterState>) => onChange({ ...value, ...patch });
  const toList = (v: string) => (v ? [v] : []);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Select
        label={t("incidentFields.severity")}
        value={value.severity[0] ?? ""}
        onChange={(e) => set({ severity: toList(e.target.value) })}
        options={[all, ...severityOptions(t)]}
      />
      <Select
        label={t("incidentFields.status")}
        value={value.status[0] ?? ""}
        onChange={(e) => set({ status: toList(e.target.value) })}
        options={[all, ...incidentStatusOptions(t)]}
      />
      <Select
        label={t("incidentFields.priority")}
        value={value.priority[0] ?? ""}
        onChange={(e) => set({ priority: toList(e.target.value) })}
        options={[all, ...priorityOptions(t)]}
      />
      <Input
        label={t("incidents.dateFrom")}
        type="date"
        value={value.startedFrom}
        onChange={(e) => set({ startedFrom: e.target.value })}
      />
      <Input
        label={t("incidents.dateTo")}
        type="date"
        value={value.startedTo}
        onChange={(e) => set({ startedTo: e.target.value })}
      />
    </div>
  );
}
