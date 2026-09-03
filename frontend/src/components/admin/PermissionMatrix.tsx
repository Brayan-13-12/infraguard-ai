"use client";

import { permissionGroupLabel, permissionLabel } from "@/components/admin/catalog";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import type { PermissionRead } from "@/types/rbac";

/**
 * Grouped, labelled permission editor / viewer. Each row is a real checkbox with
 * a friendly label + short description; the machine code is secondary metadata.
 * `readOnly` renders it as a static list (system roles, user "effective
 * permissions").
 */
export function PermissionMatrix({
  catalog,
  selected,
  onToggle,
  readOnly = false,
  idBase = "perm",
}: {
  catalog: PermissionRead[];
  selected: ReadonlySet<string>;
  onToggle?: (code: string, next: boolean) => void;
  readOnly?: boolean;
  idBase?: string;
}) {
  const { t } = useTranslation();

  const byGroup = PERMISSION_GROUPS.map((group) => ({
    group,
    perms: catalog.filter((p) => p.group === group),
  })).filter((g) => g.perms.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {byGroup.map(({ group, perms }) => (
        <fieldset key={group} className="min-w-0">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {permissionGroupLabel(t, group)}
          </legend>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {perms.map((perm) => {
              const checked = selected.has(perm.code);
              const inputId = `${idBase}-${perm.code}`;
              return (
                <li key={perm.code} className="flex items-start gap-3 px-3 py-2.5">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly}
                    onChange={(e) => onToggle?.(perm.code, e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                  />
                  <label
                    htmlFor={inputId}
                    className={cn(
                      "min-w-0 flex-1",
                      readOnly ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {permissionLabel(t, perm.code)}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {perm.code}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
