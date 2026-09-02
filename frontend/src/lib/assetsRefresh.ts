/**
 * Tiny module event bus so an Asset action rendered in a drawer (create / edit /
 * deactivate) can tell the inventory list to refetch, without prop-drilling
 * through the Parallel Route slot. Same pattern as the toast store.
 */

export interface AssetsChangedDetail {
  /** id of an asset to briefly highlight in the list, if it lands on the page. */
  focusId?: string;
}

type Listener = (detail: AssetsChangedDetail) => void;

const listeners = new Set<Listener>();

export function subscribeAssetsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAssetsChanged(detail: AssetsChangedDetail = {}): void {
  for (const listener of listeners) listener(detail);
}
