"use client";

import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/i18n";
import type { AssetStatus, Criticality } from "@/types/asset";

import {
  CRITICALITY_TONE,
  STATUS_TONE,
  criticalityLabel,
  statusLabel,
} from "./catalog";

/**
 * Criticality / status badges. Colour is a hint only - the translated label is
 * always the text, so the meaning survives for colour-blind users and in
 * grayscale, and both tones work in light and dark themes (design-token based).
 */

export function CriticalityBadge({ value }: { value: Criticality }) {
  const { t } = useTranslation();
  return (
    <Badge tone={CRITICALITY_TONE[value]} dot>
      {criticalityLabel(t, value)}
    </Badge>
  );
}

export function AssetStatusBadge({ value }: { value: AssetStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATUS_TONE[value]} dot>
      {statusLabel(t, value)}
    </Badge>
  );
}
