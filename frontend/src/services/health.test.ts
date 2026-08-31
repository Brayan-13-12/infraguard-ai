import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBackendHealth } from "@/services/health";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchBackendHealth", () => {
  it("returns ok with data for a healthy 200 readiness response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ status: "ready", service: "infraguard-api", database: "healthy" }),
      ),
    );

    const result = await fetchBackendHealth();

    expect(result).toEqual({
      ok: true,
      data: { status: "ready", service: "infraguard-api", database: "healthy" },
    });
  });

  it("treats a 503 not-ready response as a valid (ok) payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { status: "not_ready", service: "infraguard-api", database: "unhealthy" },
          503,
        ),
      ),
    );

    const result = await fetchBackendHealth();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.database).toBe("unhealthy");
  });

  it("reports 'bad-status' for an unexpected HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const result = await fetchBackendHealth();

    expect(result).toMatchObject({ ok: false, reason: "bad-status" });
  });

  it("reports 'unreachable' when the network request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await fetchBackendHealth();

    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("reports a timeout when the request is aborted", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );

    const pending = fetchBackendHealth();
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result).toEqual({
      ok: false,
      reason: "unreachable",
      detail: "Request timed out",
    });
  });

  it("reports 'malformed' when the body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await fetchBackendHealth();

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("reports 'malformed' when the JSON shape is unexpected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "weird", db: true })),
    );

    const result = await fetchBackendHealth();

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });
});
