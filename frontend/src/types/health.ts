/**
 * Shape of the backend readiness response from GET /api/v1/health/ready.
 * HTTP 200 -> status "ready"; HTTP 503 -> status "not_ready". Both carry a body.
 */
export interface BackendReadiness {
  status: "ready" | "not_ready";
  service: string;
  database: "healthy" | "unhealthy";
}

/** Runtime type guard - the network response is untrusted input. */
export function isBackendReadiness(value: unknown): value is BackendReadiness {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === "ready" || v.status === "not_ready") &&
    typeof v.service === "string" &&
    (v.database === "healthy" || v.database === "unhealthy")
  );
}

/** Result of a single component check, as rendered by the UI. */
export type ComponentState =
  | { kind: "loading" }
  | { kind: "operational"; detail?: string }
  | { kind: "down"; detail: string }
  | { kind: "unknown"; detail: string };

export interface SystemHealth {
  frontend: ComponentState;
  backend: ComponentState;
  database: ComponentState;
}
