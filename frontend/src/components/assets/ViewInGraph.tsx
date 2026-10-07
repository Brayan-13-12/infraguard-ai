"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { NetworkIcon } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import { assetGraphHref } from "@/lib/assetsRoutes";

export function ViewInGraph({ assetId, compact = false }: { assetId: string; compact?: boolean }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  if (!can("assets.read") || !can("relationships.read")) return null;
  const label = t("assetsWorkspace.viewInGraph");
  return (
    <Link href={assetGraphHref(assetId)} aria-label={label} title={label}
      className={compact
        ? "relative z-[1] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        : buttonClasses({ variant: "secondary", size: "sm" })}>
      <NetworkIcon className="h-4 w-4" />
      {!compact && label}
    </Link>
  );
}
