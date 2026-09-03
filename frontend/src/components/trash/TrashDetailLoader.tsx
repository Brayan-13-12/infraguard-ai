"use client";

import { useCallback, useEffect, useState } from "react";

import { getTrashAsset, getTrashIncident } from "@/services/trash";
import type { TrashAssetDetail, TrashIncidentDetail } from "@/types/trash";

export type TrashLoadState<T> =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; item: T };

/**
 * Fetches one trashed record by id and tracks loading / not-found / error /
 * ready. Shared by the intercepted workspace and the full-page fallback. A
 * restore navigates away, so there is no in-place update path.
 */
export function TrashAssetLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: TrashLoadState<TrashAssetDetail>;
    reload: () => void;
  }) => React.ReactNode;
}) {
  return <Loader id={id} fetcher={getTrashAsset} render={render} />;
}

export function TrashIncidentLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: TrashLoadState<TrashIncidentDetail>;
    reload: () => void;
  }) => React.ReactNode;
}) {
  return <Loader id={id} fetcher={getTrashIncident} render={render} />;
}

function Loader<T>({
  id,
  fetcher,
  render,
}: {
  id: string;
  fetcher: (
    id: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: { kind: string } }>;
  render: (ctx: { state: TrashLoadState<T>; reload: () => void }) => React.ReactNode;
}) {
  const [state, setState] = useState<TrashLoadState<T>>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void fetcher(id).then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ kind: "ready", item: res.data });
      else setState({ kind: res.error.kind === "not_found" ? "notfound" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id, fetcher]);

  useEffect(() => load(), [load, nonce]);

  return <>{render({ state, reload: () => setNonce((n) => n + 1) })}</>;
}
