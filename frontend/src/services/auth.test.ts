import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMe, login, logout, register } from "@/services/auth";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("register", () => {
  it("returns the created user on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(USER, 201)));
    const result = await register({ email: USER.email, password: "a-good-passphrase" });
    expect(result).toEqual({ ok: true, data: USER });
  });

  it("sends credentials so the cookie is stored", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(USER, 201));
    vi.stubGlobal("fetch", fetchMock);
    await register({ email: USER.email, password: "a-good-passphrase" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("maps 409 to a conflict error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "..." }, 409)));
    const result = await register({ email: USER.email, password: "a-good-passphrase" });
    expect(result).toMatchObject({ ok: false, error: { kind: "conflict" } });
  });

  it("maps 422 to field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({ detail: [{ loc: ["body", "password"], msg: "too short" }] }, 422),
      ),
    );
    const result = await register({ email: USER.email, password: "x" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "validation", fields: { password: "too short" } },
    });
  });

  it("maps 429 to a rate-limit error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "slow down" }, 429)));
    const result = await register({ email: USER.email, password: "a-good-passphrase" });
    expect(result).toMatchObject({ ok: false, error: { kind: "rate_limited" } });
  });

  it("maps a network failure to 'unreachable'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await register({ email: USER.email, password: "a-good-passphrase" });
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });
});

describe("login", () => {
  it("returns the user on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(USER, 200)));
    expect(await login({ email: USER.email, password: "pw" })).toEqual({ ok: true, data: USER });
  });

  it("maps 401 to invalid_credentials (generic)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Invalid email or password" }, 401)));
    const result = await login({ email: USER.email, password: "wrong" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_credentials", message: "Invalid email or password." },
    });
  });

  it("never rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(login({ email: USER.email, password: "pw" })).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("fetchMe", () => {
  it("returns the user on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(USER, 200)));
    expect(await fetchMe()).toEqual({ ok: true, data: USER });
  });
  it("maps 401 to unauthenticated (no message)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 401)));
    expect(await fetchMe()).toEqual({ ok: false, error: { kind: "unauthenticated" } });
  });
  it("maps a malformed body to 'unexpected'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: true }, 200)));
    expect(await fetchMe()).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });
});

describe("logout", () => {
  it("returns { ok: true } on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Logged out" }, 200)));
    expect(await logout()).toEqual({ ok: true });
  });

  it("returns { ok: false } (unexpected) on a server error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    const result = await logout();
    expect(result).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });

  it("returns { ok: false } (unreachable) on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await logout();
    expect(result).toMatchObject({ ok: false, error: { kind: "unreachable" } });
  });

  it("sends credentials and POSTs once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    await logout();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
