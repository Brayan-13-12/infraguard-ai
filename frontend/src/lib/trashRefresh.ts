/**
 * Tiny module event bus so a Trash action rendered in a detail workspace
 * (restore) can tell the Trash list to refetch, and a delete action in an
 * Asset / Incident workspace can tell the Trash counts to update - without
 * prop-drilling through the Parallel Route slot. Same pattern as
 * `assetsRefresh` / `incidentsRefresh`.
 */

export interface TrashChangedDetail {
  /** Which tab's data changed, so the browser can refetch just that list. */
  scope?: "assets" | "incidents" | "all";
}

type Listener = (detail: TrashChangedDetail) => void;

const listeners = new Set<Listener>();

export function subscribeTrashChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTrashChanged(detail: TrashChangedDetail = { scope: "all" }): void {
  for (const listener of listeners) listener(detail);
}
