"use client";

import { useCallback, useEffect, useState } from "react";

import { getAudit } from "@/services/audit";
import type { AuditEventDetail } from "@/types/audit";

export type AuditLoadState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; event: AuditEventDetail };

/**
 * Fetches one audit event by id and tracks loading / not-found / error / ready.
 * Shared by the full-page detail view and the intercepted workspace. `render`
 * also receives a `reload`. Audit events are immutable, so there is no
 * in-place update path.
 */
export function AuditDetailLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: { state: AuditLoadState; reload: () => void }) => React.ReactNode;
}) {
  const [state, setState] = useState<AuditLoadState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getAudit(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ kind: "ready", event: result.data });
      else setState({ kind: result.error.kind === "not_found" ? "notfound" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => load(), [load, nonce]);

  return <>{render({ state, reload: () => setNonce((n) => n + 1) })}</>;
}
