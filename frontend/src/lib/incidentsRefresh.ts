/**
 * Tiny module event bus so an Incident action rendered in a drawer (create /
 * edit / resolve / reopen) can tell the incidents list to refetch, without
 * prop-drilling through the Parallel Route slot. Same pattern as `assetsRefresh`.
 */

export interface IncidentsChangedDetail {
  /** id of an incident to briefly highlight in the list, if it lands on the page. */
  focusId?: string;
}

type Listener = (detail: IncidentsChangedDetail) => void;

const listeners = new Set<Listener>();

export function subscribeIncidentsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyIncidentsChanged(detail: IncidentsChangedDetail = {}): void {
  for (const listener of listeners) listener(detail);
}
