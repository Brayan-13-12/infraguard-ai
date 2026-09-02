"use client";

import { useCallback, useEffect, useState } from "react";

import { getAsset } from "@/services/assets";
import type { Asset } from "@/types/asset";

export type AssetLoadState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; asset: Asset };

/**
 * One place that fetches an asset by id and tracks loading / not-found / error /
 * ready. Used by both the full-page detail view and the detail/edit drawers so
 * there is a single load implementation. `render` receives the state plus a
 * `reload` and a `setAsset` (for in-place updates after a lifecycle action).
 */
export function AssetDetailLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: AssetLoadState;
    reload: () => void;
    setAsset: (asset: Asset) => void;
  }) => React.ReactNode;
}) {
  const [state, setState] = useState<AssetLoadState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getAsset(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ kind: "ready", asset: result.data });
      else setState({ kind: result.error.kind === "not_found" ? "notfound" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => load(), [load, nonce]);

  return (
    <>
      {render({
        state,
        reload: () => setNonce((n) => n + 1),
        setAsset: (asset) => setState({ kind: "ready", asset }),
      })}
    </>
  );
}
