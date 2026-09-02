import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIncident,
  getIncident,
  getIncidentSummary,
  listIncidents,
  reopenIncident,
  resolveIncident,
  updateIncident,
} from "@/services/incidents";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INCIDENT = {
  id: "i1",
  title: "Checkout latency",
  severity: "High",
  status: "Open",
  priority: "P2",
  owner: null,
  started_at: "2026-09-01T00:00:00Z",
  detected_at: null,
  resolved_at: null,
  affected_asset_count: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const DETAIL = {
  ...INCIDENT,
  description: null,
  created_by: "u1",
  affected_assets: [],
  timeline: [
    {
      id: "e1",
      type: "CREATED",
      message: "Incidente creado",
      created_by: "u1",
      actor_email: "a@example.com",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
};

const PAGE = { items: [INCIDENT], page: 1, page_size: 20, total: 1, total_pages: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("listIncidents", () => {
  it("returns the page and builds the query string with repeatable filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listIncidents({
      page: 2,
      q: "  latency ",
      severity: ["Critical", "High"],
      status: "Investigating",
      priority: ["P1"],
      assetId: "a1",
      sort: "severity",
    });

    expect(result).toEqual({ ok: true, data: PAGE });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("page=2");
    expect(url).toContain("q=latency");
    expect(url).toContain("severity=Critical");
    expect(url).toContain("severity=High");
    expect(url).toContain("status=Investigating");
    expect(url).toContain("priority=P1");
    expect(url).toContain("asset_id=a1");
    expect(url).toContain("sort=severity");
  });

  it("maps 401 to unauthorized and a network failure to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 401)));
    expect(await listIncidents()).toEqual({ ok: false, error: { kind: "unauthorized" } });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("x")));
    expect(await listIncidents()).toEqual({ ok: false, error: { kind: "unreachable" } });
  });

  it("reports unexpected when the payload shape is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: true })));
    expect(await listIncidents()).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });
});

describe("getIncidentSummary", () => {
  const SUMMARY = {
    total: 3,
    open: 2,
    critical_open: 1,
    investigating: 1,
    monitoring: 0,
    resolved_recently: 1,
    by_severity: { Critical: 1, High: 1, Medium: 1, Low: 0 },
    by_status: {
      Open: 1,
      Investigating: 1,
      Identified: 0,
      Monitoring: 0,
      Resolved: 1,
      Closed: 0,
    },
  };

  it("returns the summary on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(SUMMARY)));
    expect(await getIncidentSummary()).toEqual({ ok: true, data: SUMMARY });
  });
});

describe("getIncident", () => {
  it("returns the detail on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(DETAIL)));
    expect(await getIncident("i1")).toEqual({ ok: true, data: DETAIL });
  });

  it("maps 404 to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Incident not found" }, 404)));
    expect(await getIncident("missing")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("createIncident", () => {
  it("returns the created incident on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(DETAIL, 201)));
    const result = await createIncident({
      title: "Checkout latency",
      severity: "High",
      priority: "P2",
    });
    expect(result).toEqual({ ok: true, data: DETAIL });
  });

  it("maps a 422 to field errors including asset_ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            detail: [
              { loc: ["body", "asset_ids"], msg: "one or more selected assets do not exist" },
            ],
          },
          422,
        ),
      ),
    );
    const result = await createIncident({ title: "x", severity: "High", priority: "P2" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "validation", fields: { asset_ids: expect.any(String) } },
    });
  });
});

describe("updateIncident", () => {
  it("PATCHes and returns the updated incident", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...DETAIL, status: "Investigating" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updateIncident("i1", { status: "Investigating" });
    expect(result).toMatchObject({ ok: true, data: { status: "Investigating" } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ method: "PATCH" });
  });
});

describe("resolve / reopen", () => {
  it("POSTs to the lifecycle endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ ...DETAIL, status: "Resolved", resolved_at: "2026-09-02T00:00:00Z" }))
      .mockResolvedValueOnce(json({ ...DETAIL, status: "Open", resolved_at: null }));
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveIncident("i1");
    const reopened = await reopenIncident("i1");

    expect(resolved).toMatchObject({ ok: true, data: { status: "Resolved" } });
    expect(reopened).toMatchObject({ ok: true, data: { status: "Open" } });
    const [url1] = fetchMock.mock.calls[0] as [string];
    const [url2] = fetchMock.mock.calls[1] as [string];
    expect(url1).toContain("/i1/resolve");
    expect(url2).toContain("/i1/reopen");
  });
});
