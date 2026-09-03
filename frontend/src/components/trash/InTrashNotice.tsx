"use client";

import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/**
 * Shown by a normal Asset / Incident detail route when the record has been
 * soft-deleted (the backend answers `410 Gone`). A small explicit state - not a
 * bare 404 - with a link straight to the item in Trash.
 */
export function InTrashNotice({
  kind,
  compact = false,
}: {
  kind: "assets" | "incidents";
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const isAsset = kind === "assets";
  const title = isAsset ? t("assetDetail.inTrashTitle") : t("incidentDetail.inTrashTitle");
  const body = isAsset ? t("assetDetail.inTrashBody") : t("incidentDetail.inTrashBody");
  const cta = isAsset ? t("assetDetail.viewInTrash") : t("incidentDetail.viewInTrash");
  const href = isAsset ? "/trash" : "/trash?type=incidents";

  return (
    <div
      className={
        compact
          ? "flex flex-col items-center gap-3 py-16 text-center"
          : "mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center"
      }
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
        <TrashIcon />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      <Link href={href} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        {cta}
      </Link>
    </div>
  );
}
