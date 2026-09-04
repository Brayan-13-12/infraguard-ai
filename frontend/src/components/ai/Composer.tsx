"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

export function Composer({
  onSend,
  disabled,
  sending,
  maxLength,
  autoFocus,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  sending?: boolean;
  maxLength: number;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  const tooLong = value.length > maxLength;
  const canSend = value.trim().length > 0 && !tooLong && !disabled && !sending;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  return (
    <form
      className="border-t border-border bg-surface p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors focus-within:border-primary/50",
          tooLong ? "border-danger" : "border-border",
        )}
      >
        <label htmlFor="ai-composer" className="sr-only">
          {t("ai.composer.placeholder")}
        </label>
        <textarea
          id="ai-composer"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={t("ai.composer.placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[168px] min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button
          type="submit"
          size="sm"
          loading={sending}
          disabled={!canSend}
          aria-label={t("ai.composer.send")}
        >
          {sending ? t("ai.composer.sending") : <ArrowRightIcon className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>{t("ai.composer.hint")}</span>
        <span className={cn("tabular-nums", tooLong && "text-danger")}>
          {tooLong
            ? t("ai.composer.tooLong", { max: maxLength })
            : t("ai.composer.charCount", { count: value.length, max: maxLength })}
        </span>
      </div>
    </form>
  );
}
