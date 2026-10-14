import { useRef, useState } from "react";

export type Positions = Record<string, { x: number; y: number }>;
type History<T> = { past: T[]; present: T; future: T[] };
const equal = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/** In-memory presentation snapshots only. One gesture is one step; never calls APIs. */
export function useVisualHistory<T extends object>(initial: T) {
  const [history, setHistory] = useState<History<T>>({ past: [], present: initial, future: [] });
  const current = useRef(history);
  const start = useRef<T | null>(null);
  function publish(next: History<T>) { current.current = next; setHistory(next); }
  return {
    positions: history.present,
    get: () => current.current.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset(positions: T) { start.current = null; publish({ past: [], present: positions, future: [] }); },
    begin() { if (!start.current) start.current = current.current.present; },
    move(changes: Partial<T>) { publish({ ...current.current, present: { ...current.current.present, ...changes } }); },
    commit() {
      const h = current.current;
      if (start.current && !equal(start.current, h.present)) {
        publish({ past: [...h.past, start.current].slice(-50), present: h.present, future: [] });
      }
      start.current = null;
    },
    undo() {
      const h = current.current;
      if (!h.past.length || start.current) return;
      publish({ past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] });
    },
    redo() {
      const h = current.current;
      if (!h.future.length || start.current) return;
      publish({ past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) });
    },
  };
}
