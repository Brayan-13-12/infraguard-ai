"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Stack of open overlays. Only the top one reacts to Escape / Tab, so a
 * `ConfirmDialog` opened over a `Drawer` (e.g. deactivate) doesn't close the
 * drawer underneath it. Scroll-lock and focus restore already nest correctly.
 */
const overlayStack: symbol[] = [];

export type OverlayVariant = "center" | "right" | "left" | "bottom";

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible label when there is no visible titled element. */
  label?: string;
  /** id of a visible element that titles the dialog. */
  labelledBy?: string;
  /** id of a visible element that describes the dialog. */
  describedBy?: string;
  variant?: OverlayVariant;
  /** Blur the page behind the scrim. */
  blur?: boolean;
  /** Extra classes for the panel. */
  className?: string;
  /** Render the built-in close button in the panel's top-right. */
  showClose?: boolean;
  /** Backdrop click / Escape close the overlay. Default true. */
  dismissable?: boolean;
  /** z-index layer. Default 50. */
  z?: number;
  /**
   * CSS selector (queried within the panel) for the element to focus on open.
   * Falls back to the first focusable node, then the panel itself.
   */
  initialFocus?: string;
}

const OUTER: Record<OverlayVariant, string> = {
  center: "flex items-center justify-center p-4",
  right: "flex justify-end",
  left: "flex justify-start",
  bottom: "flex items-end",
};

const PANEL: Record<OverlayVariant, string> = {
  center:
    "w-full max-w-lg rounded-xl border border-border shadow-lg motion-safe:animate-scale-in",
  // Edge panels leave their width to the consumer's `className` (one source).
  right: "h-full w-full border-l border-border shadow-lg motion-safe:animate-slide-in-right",
  left: "h-full w-full border-r border-border shadow-lg motion-safe:animate-slide-in-left",
  bottom:
    "w-full max-h-[85vh] rounded-t-xl border-t border-border shadow-lg motion-safe:animate-slide-in-up",
};

/**
 * Headless modal surface. Generalises the mobile-nav drawer behaviour that has
 * been proven in the shell: portal to <body>, backdrop with the `--overlay`
 * token, Escape + backdrop dismissal, focus moves in on open and is restored to
 * the trigger on close, focus is trapped while open, the page is scroll-locked,
 * and `role="dialog" aria-modal` is set. Reduced motion is respected (entrance
 * animations are `motion-safe:` and the global rule neutralises the rest).
 *
 * Consumers: {@link Dialog}, {@link Drawer}, {@link ConfirmDialog}.
 */
export function Overlay({
  open,
  onClose,
  children,
  label,
  labelledBy,
  describedBy,
  variant = "center",
  blur = false,
  className,
  showClose = false,
  dismissable = true,
  z = 50,
  initialFocus,
}: OverlayProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const stackId = Symbol("overlay");
    overlayStack.push(stackId);
    const isTop = () => overlayStack[overlayStack.length - 1] === stackId;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Lock every scroll surface: the body (default document scroller) and the
    // app-shell main pane (`[data-scroll-lock]`), which is the real scroller
    // inside the authenticated shell.
    const locked = [
      document.body,
      ...Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-lock]")),
    ];
    const prevOverflow = locked.map((el) => el.style.overflow);
    locked.forEach((el) => {
      el.style.overflow = "hidden";
    });

    // Focus the requested node, else the first focusable, else the panel.
    const panel = panelRef.current;
    const preferred = initialFocus
      ? panel?.querySelector<HTMLElement>(initialFocus)
      : null;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (preferred ?? first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape") {
        if (dismissableRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (!firstNode || !lastNode) return;
      const active = document.activeElement as HTMLElement | null;
      if (!panel.contains(active)) {
        e.preventDefault();
        firstNode.focus();
      } else if (e.shiftKey && active === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && active === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const idx = overlayStack.indexOf(stackId);
      if (idx !== -1) overlayStack.splice(idx, 1);
      locked.forEach((el, i) => {
        el.style.overflow = prevOverflow[i] ?? "";
      });
      previouslyFocused?.focus?.();
    };
  }, [open, initialFocus]);

  const { t } = useTranslation();
  if (!mounted || !open) return null;

  return createPortal(
    <div className={cn("fixed inset-0", OUTER[variant])} style={{ zIndex: z }}>
      <div
        aria-hidden="true"
        onClick={dismissable ? onClose : undefined}
        className={cn(
          "absolute inset-0 bg-overlay/60 motion-safe:animate-fade-in",
          blur && "backdrop-blur-sm",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex flex-col overflow-hidden bg-surface text-foreground outline-none",
          PANEL[variant],
          className,
        )}
      >
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("overlay.close")}
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CloseIcon />
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
