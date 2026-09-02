"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Overlay } from "./Overlay";

type DialogSize = "sm" | "md" | "lg";

const SIZE: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  /** Hide the header close button (e.g. a confirm flow with explicit actions). */
  hideClose?: boolean;
  dismissable?: boolean;
}

/**
 * Centered modal dialog built on {@link Overlay}. Titled and (optionally)
 * described for assistive tech; body scrolls within a fixed max height.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  dismissable = true,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="center"
      dismissable={dismissable}
      showClose={!hideClose}
      labelledBy={titleId}
      describedBy={description ? descId : undefined}
      className={cn(SIZE[size])}
    >
      <div
        className={cn(
          "flex flex-col gap-1 border-b border-border p-5 sm:p-6",
          !hideClose && "pr-14 sm:pr-14",
        )}
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {children ? (
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      ) : null}

      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4 sm:px-6">
          {footer}
        </div>
      ) : null}
    </Overlay>
  );
}
