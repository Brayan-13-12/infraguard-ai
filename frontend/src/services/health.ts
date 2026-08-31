import { READINESS_ENDPOINT } from "@/lib/config";
import { BackendReadiness, isBackendReadiness } from "@/types/health";

export type HealthFetchResult =
  | { ok: true; data: BackendReadiness }
  | { ok: false; reason: "unreachable" | "bad-status" | "malformed"; detail: string };

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Fetch backend readiness. Never throws - every failure mode is returned as data
 * so the UI can render an explicit state.
 */
export async function fetchBackendHealth(): Promise<HealthFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(READINESS_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    // Readiness returns 200 (ready) or 503 (not ready); both carry a valid body.
    // Anything else is an unexpected status.
    if (res.status !== 200 && res.status !== 503) {
      return { ok: false, reason: "bad-status", detail: `HTTP ${res.status}` };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return { ok: false, reason: "malformed", detail: "Response was not valid JSON" };
    }

    if (!isBackendReadiness(payload)) {
      return { ok: false, reason: "malformed", detail: "Unexpected response shape" };
    }

    return { ok: true, data: payload };
  } catch (err) {
    const detail =
      err instanceof DOMException && err.name === "AbortError"
        ? "Request timed out"
        : "Could not reach the backend API";
    return { ok: false, reason: "unreachable", detail };
  } finally {
    clearTimeout(timer);
  }
}
