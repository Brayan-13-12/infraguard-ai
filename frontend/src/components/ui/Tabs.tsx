"use client";

import { useId, useRef } from "react";

import { cn } from "@/lib/cn";

export interface TabDef {
  id: string;
  label: string;
  /** Optional trailing count, e.g. affected-asset total. */
  badge?: number;
}

/**
 * Accessible tab bar (WAI-ARIA tab pattern): `role="tablist"` with roving
 * tabindex and Left/Right/Home/End keyboard navigation. The consumer renders the
 * matching panel and spreads {@link tabPanelProps} on it.
 *
 * Restrained underline styling; the row scrolls horizontally on narrow screens.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  idBase,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  /** Stable prefix so tab/panel ids match across renders. */
  idBase: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next = index;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
            {typeof tab.badge === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                  selected ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Props for the panel element that a given tab controls. */
export function tabPanelProps(idBase: string, tabId: string) {
  return {
    role: "tabpanel" as const,
    id: `${idBase}-panel-${tabId}`,
    "aria-labelledby": `${idBase}-tab-${tabId}`,
    tabIndex: 0,
  };
}

/** Small hook to give a component a stable `idBase` for {@link Tabs}. */
export function useTabsId(prefix: string): string {
  const id = useId();
  return `${prefix}${id}`;
}
