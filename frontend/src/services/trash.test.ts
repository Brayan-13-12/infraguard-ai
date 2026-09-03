import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTrashAsset,
  getTrashSummary,
  listTrashAssets,
  listTrashIncidents,
  restoreTrashAsset,
} from "@/services/trash";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ASSET_ROW = {
  id: "a1",
  name: "payments-db",
  asset_type: "Database",
  environment: "Production",
  criticality: "Critical",
  status: "Operational",
  deleted_at: "2026-09-02T12:00:00Z",
  deleted_by: "u1",
  deleted_by_email: "ops@example.com",
};
const ASSET_PAGE = { items: [ASSET_ROW], page: 1, page_size: 20, total: 1, total_pages: 1 };

const INCIDENT_ROW = {
  id: "i1",
  title: "checkout latency",
  severity: "High",
  status: "Open",
  priority: "P2",
  owner: null,
  affected_asset_count: 2,
  deleted_at: "2026-09-02T12:00:00Z",
  deleted_by: null,
  deleted_by_email: null,
};
const INCIDENT_PAGE = { items: [INCIDENT_ROW], page: 1, page_size: 15, total: 1, total_pages: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("listTrashAssets", () => {
  it("builds the query string and returns the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(ASSET_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const res = await listTrashAssets({
      page: 2,
      q: "  db ",
      type: "Database",
      criticality: "Critical",
      deletedBy: " ops@example.com ",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T23:59:59.000Z",
    });

    expect(res).toEqual({ ok: true, data: ASSET_PAGE });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/trash/assets?");
    expect(url).toContain("page=2");
    expect(url).toContain("q=db");
    expect(url).toContain("type=Database");
    expect(url).toContain("criticality=Critical");
    expect(url).toContain("deleted_by=ops%40example.com");
    expect(url).toContain("from=2026-09-01");
  });

  it("maps 401 to unauthorized and a network failure to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    expect(await listTrashAssets()).toEqual({ ok: false, error: { kind: "unauthorized" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("x")));
    expect(await listTrashAssets()).toEqual({ ok: false, error: { kind: "unreachable" } });
  });

  it("reports unexpected on a wrong shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: true })));
    expect(await listTrashAssets()).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });
});

describe("listTrashIncidents", () => {
  it("builds the incident query and returns the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(INCIDENT_PAGE));
    vi.stubGlobal("fetch", fetchMock);
    const res = await listTrashIncidents({ severity: "High", status: "Open" });
    expect(res).toEqual({ ok: true, data: INCIDENT_PAGE });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/trash/incidents?");
    expect(url).toContain("severity=High");
    expect(url).toContain("status=Open");
  });
});

describe("getTrashAsset / restoreTrashAsset / getTrashSummary", () => {
  it("getTrashAsset returns the detail on 200 and maps 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({ ...ASSET_ROW, hostname: null, ip_address: null, owner: null, description: null, is_active: false, created_at: "x", updated_at: "y" }),
      ),
    );
    expect((await getTrashAsset("a1")).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 404)));
    expect(await getTrashAsset("missing")).toEqual({ ok: false, error: { kind: "not_found" } });
  });

  it("restoreTrashAsset succeeds on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Asset restored" })));
    expect(await restoreTrashAsset("a1")).toEqual({ ok: true, data: null });
  });

  it("getTrashSummary returns the counters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ assets: 3, incidents: 1 })));
    expect(await getTrashSummary()).toEqual({ ok: true, data: { assets: 3, incidents: 1 } });
  });
});
