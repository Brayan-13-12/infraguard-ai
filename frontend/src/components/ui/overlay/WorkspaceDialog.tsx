"use client";

import type { ReactNode } from "react";

import { CloseIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";

import { Overlay } from "./Overlay";

export interface WorkspaceDialogProps {
  /** Route-mounted workspaces are always open; defaults to `true`. */
  open?: boolean;
  onClose: () => void;
  /**
   * `workspace` (default) - the large fixed-size detail surface.
   * `modal` - a slightly smaller, content-height centered creation modal.
   * Both are full-screen sheets on mobile.
   */
  variant?: "workspace" | "modal";
  /** Accessible name for the dialog. */
  label: string;
  /** Sticky header content (title, badges …). The close control is added here. */
  header: ReactNode;
  /** Sticky row under the header - typically a {@link Tabs} bar. */
  subheader?: ReactNode;
  /** Sticky footer - lifecycle actions. */
  footer?: ReactNode;
  /** Scrollable body. */
  children: ReactNode;
  initialFocus?: string;
  contentClassName?: string;
}

/**
 * Large centered "workspace" dialog for detail views: a spacious application
 * surface (not a small confirmation dialog) with a subtle brand accent line, a
 * sticky header + close, an optional sticky tab bar, an internally scrolling
 * body, and an optional sticky lifecycle footer. Full-screen sheet on mobile.
 *
 * Built on {@link Overlay}, so it participates in the overlay stack: a
 * {@link Dialog} / {@link ConfirmDialog} opened on top keeps Escape / focus
 * trap to itself and does not close this workspace.
 */
export function WorkspaceDialog({
  open = true,
  onClose,
  variant = "workspace",
  label,
  header,
  subheader,
  footer,
  children,
  initialFocus,
  contentClassName,
}: WorkspaceDialogProps) {
  const { t } = useTranslation();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant={variant}
      label={label}
      initialFocus={initialFocus}
      className="text-foreground"
    >
      <div aria-hidden="true" className="h-[3px] shrink-0 bg-primary/80" />

      <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("overlay.close")}
          className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <CloseIcon />
        </button>
      </div>

      {subheader ? (
        <div className="shrink-0 px-5 sm:px-6">{subheader}</div>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 [scrollbar-gutter:stable]",
          contentClassName,
        )}
      >
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5 sm:px-6 [padding-bottom:max(0.875rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      ) : null}
    </Overlay>
  );
}
