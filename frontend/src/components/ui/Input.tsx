import { forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Field-level error message. Renders red border + `aria-invalid` + wires `aria-describedby`. */
  error?: string;
  /** Helper text shown when there is no error. */
  hint?: string;
  /** Optional element rendered inside the field on the right (e.g. a show/hide button). */
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground shadow-xs",
            "placeholder:text-muted-foreground/70",
            "outline-none transition-colors",
            "focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-danger" : "border-border hover:border-muted-foreground/50",
            trailing ? "pr-10" : null,
            className,
          )}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
