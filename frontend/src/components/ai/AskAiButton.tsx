"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";
import { buttonClasses } from "@/components/ui/Button";
import { SparklesIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

/**
 * Context-aware entry point into the AI Assistant. Passes only the entity id in
 * the URL - the backend re-fetches the entity and enforces permissions, so a
 * tampered id grants nothing. Hidden entirely when the user lacks `ai.use`.
 */
export function AskAiButton({
  entity,
  size = "sm",
}: {
  entity: { type: "asset" | "incident"; id: string };
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { can } = useAuth();

  if (!can("ai.use")) return null;

  const param = entity.type === "asset" ? "asset_id" : "incident_id";
  const label = entity.type === "asset" ? t("ai.askAiAsset") : t("ai.analyzeIncident");

  return (
    <Link
      href={`/ai?${param}=${encodeURIComponent(entity.id)}`}
      className={buttonClasses({ variant: "secondary", size })}
    >
      <SparklesIcon className="h-4 w-4 text-primary" />
      {label}
    </Link>
  );
}
