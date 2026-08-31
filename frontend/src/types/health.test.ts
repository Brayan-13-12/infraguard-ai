import { describe, expect, it } from "vitest";

import { isBackendReadiness } from "@/types/health";

describe("isBackendReadiness", () => {
  it("accepts a well-formed payload", () => {
    expect(
      isBackendReadiness({ status: "ready", service: "infraguard-api", database: "healthy" }),
    ).toBe(true);
    expect(
      isBackendReadiness({
        status: "not_ready",
        service: "infraguard-api",
        database: "unhealthy",
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    "ready",
    42,
    {},
    { status: "ready", service: "x" },
    { status: "up", service: "x", database: "healthy" },
    { status: "ready", service: 1, database: "healthy" },
    { status: "ready", service: "x", database: "maybe" },
  ])("rejects malformed value %o", (value) => {
    expect(isBackendReadiness(value)).toBe(false);
  });
});
