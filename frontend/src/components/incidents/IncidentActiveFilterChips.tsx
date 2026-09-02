"use client";

import { CloseIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import type {
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
} from "@/types/incident";

import type { IncidentFilterState } from "./IncidentFilters";
import { incidentStatusLabel, priorityLabel, severityLabel } from "./catalog";

interface Chip {
  id: string;
  field: string;
  value: string;
  remove: () => void;
}

export function IncidentActiveFilterChips({
  search,
  filters,
  assetName,
  onSearchClear,
  onChange,
  onClearAll,
}: {
  search: string;
  filters: IncidentFilterState;
  assetName?: string;
  onSearchClear: () => void;
  onChange: (next: IncidentFilterState) => void;
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
  for (const s of filters.severity) {
    chips.push({
      id: `severity:${s}`,
      field: t("incidentFields.severity"),
      value: severityLabel(t, s as IncidentSeverity),
      remove: () =>
        onChange({ ...filters, severity: filters.severity.filter((x) => x !== s) }),
    });
  }
  for (const s of filters.status) {
    chips.push({
      id: `status:${s}`,
      field: t("incidentFields.status"),
      value: incidentStatusLabel(t, s as IncidentStatus),
      remove: () => onChange({ ...filters, status: filters.status.filter((x) => x !== s) }),
    });
  }
  for (const p of filters.priority) {
    chips.push({
      id: `priority:${p}`,
      field: t("incidentFields.priority"),
      value: priorityLabel(t, p as IncidentPriority),
      remove: () => onChange({ ...filters, priority: filters.priority.filter((x) => x !== p) }),
    });
  }
  if (filters.assetId) {
    chips.push({
      id: "asset",
      field: t("incidentFields.affectedAssets"),
      value: assetName ?? filters.assetId,
      remove: () => onChange({ ...filters, assetId: "" }),
    });
  }
  if (filters.startedFrom) {
    chips.push({
      id: "from",
      field: t("incidents.dateFrom"),
      value: filters.startedFrom,
      remove: () => onChange({ ...filters, startedFrom: "" }),
    });
  }
  if (filters.startedTo) {
    chips.push({
      id: "to",
      field: t("incidents.dateTo"),
      value: filters.startedTo,
      remove: () => onChange({ ...filters, startedTo: "" }),
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
