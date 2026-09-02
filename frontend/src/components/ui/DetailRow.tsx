"use client";

import type { ReactNode } from "react";

import { PencilIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * A label / value row for the detail workspaces. When `onEdit` is provided a
 * subtle edit affordance appears (a quiet pencil that brightens on hover /
 * focus; always visible on touch). Read-only rows omit `onEdit` and have no
 * affordance.
 */
export function DetailRow({
  label,
  children,
  onEdit,
  editLabel,
  className,
}: {
  label: string;
  children: ReactNode;
  onEdit?: () => void;
  /** Accessible name for the edit control, e.g. "Editar responsable". */
  editLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group grid gap-1 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:items-baseline sm:gap-6",
        className,
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start justify-between gap-2 text-sm text-foreground">
        <span className="min-w-0 break-words">{children}</span>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={editLabel ?? label}
            className="shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover:text-muted-foreground"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </dd>
    </div>
  );
}

export const NotSet = ({ label }: { label: string }) => (
  <span className="text-muted-foreground">{label}</span>
);
