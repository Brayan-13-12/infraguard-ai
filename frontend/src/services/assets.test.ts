import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAsset,
  deactivateAsset,
  getAsset,
  listAssets,
  reactivateAsset,
  updateAsset,
} from "@/services/assets";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ASSET = {
  id: "a1",
  name: "web-01",
  asset_type: "Server",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  hostname: null,
  ip_address: null,
  owner: null,
  description: null,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const PAGE = { items: [ASSET], page: 1, page_size: 20, total: 1, total_pages: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("listAssets", () => {
  it("returns the page on 200 and builds the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAssets({
      page: 2,
      q: "  web ",
      assetType: "Server",
      environment: "Production",
      isActive: false,
    });

    expect(result).toEqual({ ok: true, data: PAGE });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=2");
    expect(url).toContain("q=web");
    expect(url).toContain("asset_type=Server");
    expect(url).toContain("environment=Production");
    expect(url).toContain("is_active=false");
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("maps 401 to unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 401)));
    expect(await listAssets()).toEqual({ ok: false, error: { kind: "unauthorized" } });
  });

  it("maps a network failure to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await listAssets()).toEqual({ ok: false, error: { kind: "unreachable" } });
  });

  it("reports unexpected when the payload shape is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: true })));
    expect(await listAssets()).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });
});

describe("getAsset", () => {
  it("returns the asset on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(ASSET)));
    expect(await getAsset("a1")).toEqual({ ok: true, data: ASSET });
  });

  it("maps 404 to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Asset not found" }, 404)));
    expect(await getAsset("missing")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("createAsset", () => {
  it("returns the created asset on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(ASSET, 201)));
    const result = await createAsset({
      name: "web-01",
      asset_type: "Server",
      environment: "Production",
      criticality: "Critical",
      status: "Operational",
    });
    expect(result).toEqual({ ok: true, data: ASSET });
  });

  it("maps a 422 to field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            detail: [
              { loc: ["body", "ip_address"], msg: "must be a valid IPv4 or IPv6 address" },
              { loc: ["body", "name"], msg: "field required" },
            ],
          },
          422,
        ),
      ),
    );
    const result = await createAsset({
      name: "",
      asset_type: "Server",
      environment: "Production",
      criticality: "Critical",
      status: "Operational",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "validation",
        fields: { ip_address: expect.stringMatching(/valid/i), name: expect.any(String) },
      },
    });
  });
});

describe("updateAsset", () => {
  it("PATCHes and returns the updated asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...ASSET, status: "Degraded" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updateAsset("a1", { status: "Degraded" });
    expect(result).toMatchObject({ ok: true, data: { status: "Degraded" } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ method: "PATCH" });
  });
});

describe("deactivate / reactivate", () => {
  it("POSTs to the lifecycle endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ ...ASSET, is_active: false }))
      .mockResolvedValueOnce(json({ ...ASSET, is_active: true }));
    vi.stubGlobal("fetch", fetchMock);

    const off = await deactivateAsset("a1");
    const on = await reactivateAsset("a1");

    expect(off).toMatchObject({ ok: true, data: { is_active: false } });
    expect(on).toMatchObject({ ok: true, data: { is_active: true } });
    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [url2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url1).toContain("/a1/deactivate");
    expect(url2).toContain("/a1/reactivate");
    expect(init1).toMatchObject({ method: "POST" });
  });
});
