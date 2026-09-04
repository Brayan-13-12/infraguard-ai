"use client";

import { BoxIcon, ShieldIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { AIConversationContext } from "@/types/ai";

export function ContextBanner({ context }: { context: AIConversationContext }) {
  const { t } = useTranslation();
  const Icon = context.type === "asset" ? BoxIcon : ShieldIcon;
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border px-4 py-2 text-xs sm:px-6",
        context.available ? "bg-primary/5 text-foreground" : "bg-warning/10 text-warning",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate font-medium">
        {t("ai.contextBanner", { label: context.label })}
      </span>
      {!context.available ? (
        <span className="ml-1 truncate text-muted-foreground">
          · {t("ai.contextUnavailable")}
        </span>
      ) : null}
    </div>
  );
}
