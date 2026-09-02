import { afterEach, describe, expect, it, vi } from "vitest";

import { getAudit, getAuditSummary, listAudit } from "@/services/audit";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const LIST_ITEM = {
  id: "e1",
  occurred_at: "2026-09-02T10:00:00Z",
  action: "UPDATE",
  entity_type: "Asset",
  entity_id: "a1",
  entity_label: "payments-db",
  actor_user_id: "u1",
  actor_email: "ops@example.com",
  change_count: 2,
  change_preview: [{ field_name: "status", old_value: "Operational", new_value: "Degraded" }],
};

const PAGE = { items: [LIST_ITEM], page: 1, page_size: 25, total: 1, total_pages: 1 };

const DETAIL = {
  ...LIST_ITEM,
  request_id: "req-123",
  ip_address: "203.0.113.7",
  user_agent: "Mozilla/5.0",
  metadata: null,
  changes: [{ field_name: "status", old_value: "Operational", new_value: "Degraded" }],
};

const SUMMARY = {
  events_today: 4,
  changes_today: 6,
  logins_today: 2,
  active_actors_today: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("listAudit", () => {
  it("returns the page and builds the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAudit({
      page: 2,
      q: "  payments ",
      action: "UPDATE",
      entityType: "Asset",
      actor: " ops@example.com ",
      entityId: "a1",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T23:59:59.000Z",
    });

    expect(result).toEqual({ ok: true, data: PAGE });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("page=2");
    expect(url).toContain("q=payments");
    expect(url).toContain("action=UPDATE");
    expect(url).toContain("entity_type=Asset");
    expect(url).toContain("actor=ops%40example.com");
    expect(url).toContain("entity_id=a1");
    expect(url).toContain("from=2026-09-01");
    expect(url).toContain("to=2026-09-02");
  });

  it("maps 401 to unauthorized and a network failure to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "x" }, 401)));
    expect(await listAudit()).toEqual({ ok: false, error: { kind: "unauthorized" } });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("x")));
    expect(await listAudit()).toEqual({ ok: false, error: { kind: "unreachable" } });
  });

  it("reports unexpected when the payload shape is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: true })));
    expect(await listAudit()).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });
});

describe("getAudit", () => {
  it("returns the detail on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(DETAIL)));
    expect(await getAudit("e1")).toEqual({ ok: true, data: DETAIL });
  });

  it("maps 404 to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Audit event not found" }, 404)));
    expect(await getAudit("missing")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("getAuditSummary", () => {
  it("returns the summary on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(SUMMARY)));
    expect(await getAuditSummary()).toEqual({ ok: true, data: SUMMARY });
  });
});
