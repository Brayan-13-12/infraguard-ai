"use client";

import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

import { auditActionIcon, auditActionLabel, auditActionVisual } from "./catalog";

/**
 * The circular timeline node for an audit action: a restrained disc with a
 * faint tinted fill, a semantic-coloured border and the action's icon. All the
 * colour classes come from the centralized {@link auditActionVisual} catalog -
 * this component only picks the size. Decorative for AT purposes beyond its
 * `aria-label`; the visible event title carries the meaning.
 */
export function AuditActionIcon({
  action,
  size = "md",
  className,
}: {
  action: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = auditActionIcon(action);
  const { node } = auditActionVisual(action);
  return (
    <span
      role="img"
      aria-label={auditActionLabel(t, action)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full ring-1 transition-[box-shadow,background-color]",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        node,
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}
