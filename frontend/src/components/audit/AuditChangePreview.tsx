"use client";

import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { isInlinePreviewable, type AuditChange } from "@/types/audit";

/** `owner_email` -> `Owner email`. Keeps field names honest but readable. */
export function prettyFieldName(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Value({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "break-words",
        strong ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Compact inline change preview for a timeline event. Renders the first few
 * short changes as `antes → después`; long / prose fields collapse to
 * "{campo} modificado"; anything beyond the preview shows a "+N más" line.
 * `red`/`green` diff styling is deliberately avoided - old is muted, new is
 * stronger, the arrow is subtle.
 */
export function AuditChangePreview({
  changes,
  changeCount,
  className,
}: {
  changes: AuditChange[];
  changeCount: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const extra = changeCount - changes.length;

  return (
    <ul className={cn("flex flex-col gap-1 text-xs", className)}>
      {changes.map((c) => {
        const field = prettyFieldName(c.field_name);
        if (c.field_name === "is_active") {
          return (
            <li key={c.field_name} className="text-muted-foreground">
              {c.new_value === "false" ? t("audit.deactivated") : t("audit.activated")}
            </li>
          );
        }
        if (!isInlinePreviewable(c)) {
          return (
            <li key={c.field_name} className="text-muted-foreground">
              {t("audit.fieldModified", { field })}
            </li>
          );
        }
        return (
          <li key={c.field_name} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium text-muted-foreground">{field}:</span>
            <Value>{c.old_value ?? t("auditDetail.emptyValue")}</Value>
            <span aria-hidden="true" className="text-muted-foreground/60">
              →
            </span>
            <Value strong>{c.new_value ?? t("auditDetail.emptyValue")}</Value>
          </li>
        );
      })}
      {extra > 0 ? (
        <li className="text-muted-foreground/80">
          {extra === 1
            ? t("audit.moreChangesOne")
            : t("audit.moreChanges", { count: extra })}
        </li>
      ) : null}
    </ul>
  );
}
