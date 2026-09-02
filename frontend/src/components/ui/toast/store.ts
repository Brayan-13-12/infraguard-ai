/**
 * Dependency-free toast store. A module singleton so `toast()` can be called
 * from anywhere (event handlers, services) while a single mounted `<Toaster>`
 * subscribes and renders the stack.
 */

export type ToastTone = "success" | "info" | "warning" | "danger";

export interface ToastOptions {
  title?: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. `0` keeps it until dismissed. Default 5000. */
  durationMs?: number;
  /** Important errors: `role="alert"` + assertive announcement. Default false. */
  important?: boolean;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  tone: ToastTone;
  durationMs: number;
  important: boolean;
}

type Listener = (toasts: ToastRecord[]) => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

let counter = 0;

export function toast(input: ToastOptions | string): string {
  const opts: ToastOptions = typeof input === "string" ? { description: input } : input;
  const id = `t${++counter}`;
  const record: ToastRecord = {
    tone: "info",
    durationMs: 5000,
    important: false,
    ...opts,
    id,
  };
  toasts = [...toasts, record];
  emit();
  return id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Test/reset helper. */
export function clearToasts(): void {
  toasts = [];
  emit();
}
