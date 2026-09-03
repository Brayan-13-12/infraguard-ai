"use client";

import { Badge } from "@/components/ui/Badge";
import { useTranslation, type TranslationKey } from "@/i18n";
import type { AccountStatus } from "@/types/auth";

const TONE: Record<AccountStatus, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  pending: "warning",
  rejected: "neutral",
  disabled: "danger",
};

const LABEL: Record<AccountStatus, TranslationKey> = {
  active: "admin.common.active",
  pending: "admin.common.pending",
  rejected: "admin.common.rejected",
  disabled: "admin.common.disabled",
};

/** Text badge for the four account lifecycle states. */
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const { t } = useTranslation();
  return <Badge tone={TONE[status]}>{t(LABEL[status])}</Badge>;
}
