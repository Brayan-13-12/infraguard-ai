"use client";

import { useTranslation, type TranslationKey } from "@/i18n";
import type { AIEvidenceItem } from "@/types/ai";

const SOURCE_KEY: Record<string, TranslationKey> = {
  assets: "ai.evidence.assets",
  incidents: "ai.evidence.incidents",
  audit: "ai.evidence.audit",
  incident_timeline: "ai.evidence.incident_timeline",
  dashboard: "ai.evidence.dashboard",
};

/** "Sources" strip under a grounded answer - which tools produced it. */
export function EvidenceList({ evidence }: { evidence: AIEvidenceItem[] }) {
  const { t } = useTranslation();
  if (evidence.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("ai.evidence.heading")}
      </span>
      {evidence.map((item, i) => {
        const key = SOURCE_KEY[item.source];
        const label = key ? t(key) : item.label;
        const count =
          item.count === 1
            ? t("ai.evidence.records", { count: item.count })
            : t("ai.evidence.recordsPlural", { count: item.count });
        return (
          <span
            key={`${item.source}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {label}
            <span className="tabular-nums text-muted-foreground/70">· {count}</span>
          </span>
        );
      })}
    </div>
  );
}
