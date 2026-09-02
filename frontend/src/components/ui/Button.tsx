import { forwardRef } from "react";

import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[color,background-color,border-color,transform,opacity] duration-150 outline-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "active:scale-[0.98] motion-reduce:active:scale-100 " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

/** Shared class string - use on a `<Link>` when you need a button-styled link. */
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const { variant = "primary", size = "md", fullWidth = false, className } = opts ?? {};
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading && <Spinner decorative className="text-current" />}
      {children}
    </button>
  );
});
