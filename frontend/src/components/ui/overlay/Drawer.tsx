"use client";

import { useId, type ReactNode } from "react";

import { Overlay } from "./Overlay";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Visible header title. If omitted, pass `label` for the accessible name. */
  title?: ReactNode;
  label?: string;
  side?: "right" | "left" | "bottom";
  className?: string;
  /** Render Overlay's built-in top-right close button. Default true. */
  showClose?: boolean;
  dismissable?: boolean;
  /** CSS selector for the element to focus on open (see {@link Overlay}). */
  initialFocus?: string;
}

/**
 * Edge-anchored panel built on {@link Overlay}. Used for the mobile navigation
 * drawer and future contextual panels. When `title` is omitted the consumer
 * owns the header (e.g. brand + close) and should pass `label` for the
 * accessible name.
 */
export function Drawer({
  open,
  onClose,
  children,
  title,
  label,
  side = "right",
  className,
  showClose = true,
  dismissable = true,
  initialFocus,
}: DrawerProps) {
  const titleId = useId();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant={side}
      dismissable={dismissable}
      showClose={showClose}
      labelledBy={title ? titleId : undefined}
      label={title ? undefined : label}
      className={className}
      initialFocus={initialFocus}
    >
      {title ? (
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4 pr-14">
          <h2 id={titleId} className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </Overlay>
  );
}
