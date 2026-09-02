"use client";

import { useCallback, useEffect, useState } from "react";

import { getIncident } from "@/services/incidents";
import type { IncidentDetail } from "@/types/incident";

export type IncidentLoadState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; incident: IncidentDetail };

/**
 * One place that fetches an incident by id and tracks loading / not-found /
 * error / ready. Used by the full-page detail view and the detail/edit drawers.
 * `render` receives the state plus a `reload` and a `setIncident` for in-place
 * updates after a lifecycle action.
 */
export function IncidentDetailLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: IncidentLoadState;
    reload: () => void;
    setIncident: (incident: IncidentDetail) => void;
  }) => React.ReactNode;
}) {
  const [state, setState] = useState<IncidentLoadState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getIncident(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ kind: "ready", incident: result.data });
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
        setIncident: (incident) => setState({ kind: "ready", incident }),
      })}
    </>
  );
}
