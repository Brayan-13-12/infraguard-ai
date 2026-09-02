"use client";

import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/i18n";
import type {
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
} from "@/types/incident";

import {
  INCIDENT_STATUS_TONE,
  SEVERITY_TONE,
  incidentStatusLabel,
  priorityLabel,
  severityLabel,
} from "./catalog";

/**
 * Severity / status / priority badges. Colour is a hint only - the translated
 * label is always the text, so meaning survives for colour-blind users and in
 * grayscale. Priority is intentionally a plain neutral badge so it never
 * competes with severity.
 */

export function SeverityBadge({ value }: { value: IncidentSeverity }) {
  const { t } = useTranslation();
  return (
    <Badge tone={SEVERITY_TONE[value]} dot>
      {severityLabel(t, value)}
    </Badge>
  );
}

export function IncidentStatusBadge({ value }: { value: IncidentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={INCIDENT_STATUS_TONE[value]} dot>
      {incidentStatusLabel(t, value)}
    </Badge>
  );
}

export function PriorityBadge({ value }: { value: IncidentPriority }) {
  const { t } = useTranslation();
  return (
    <Badge tone="neutral" className="font-mono text-[11px] tracking-tight">
      {priorityLabel(t, value)}
    </Badge>
  );
}
