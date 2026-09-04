"use client";

import { SparklesIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import type { AIMessage } from "@/types/ai";

import { EntityCard } from "./EntityCard";
import { EvidenceList } from "./EvidenceList";

export function MessageBubble({
  message,
  onSuggestion,
}: {
  message: AIMessage;
  onSuggestion?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div className={cn("flex max-w-[46rem] gap-3", isUser && "flex-row-reverse")}>
        {!isUser ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <SparklesIcon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
            {isUser ? t("ai.roleUser") : t("ai.roleAssistant")}
          </span>
          <div
            className={cn(
              "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm border border-border bg-surface text-foreground",
            )}
          >
            {message.content}
          </div>

          {!isUser && message.entities.length > 0 ? (
            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              {message.entities.slice(0, 6).map((e) => (
                <EntityCard key={`${e.type}-${e.id}`} entity={e} />
              ))}
            </div>
          ) : null}

          {!isUser ? <EvidenceList evidence={message.evidence} /> : null}

          {!isUser && message.suggestions.length > 0 && onSuggestion ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {message.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
