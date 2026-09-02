"use client";

import { dismissToast, toast, type ToastOptions } from "./store";

/**
 * Hook access to the toast API. Identical to the module-level `toast()` /
 * `dismissToast()` - provided for call sites that prefer a hook.
 */
export function useToast(): {
  toast: (input: ToastOptions | string) => string;
  dismiss: (id: string) => void;
} {
  return { toast, dismiss: dismissToast };
}
