import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRole,
  deleteRole,
  getPermissionCatalog,
  listUsers,
  setUserActive,
  setUserRoles,
} from "@/services/admin";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER_PAGE = {
  items: [
    {
      id: "u1",
      email: "a@example.com",
      account_status: "active",
      is_active: true,
      created_at: "2026-09-01T00:00:00Z",
      roles: [{ id: "r1", name: "Administrator", slug: "administrator", is_system: true }],
    },
  ],
  page: 1,
  page_size: 20,
  total: 1,
  total_pages: 1,
};

const USER_DETAIL = {
  id: "u1",
  email: "a@example.com",
  account_status: "active",
  is_active: true,
  created_at: "x",
  updated_at: "y",
  roles: [],
  permissions: ["assets.read"],
  is_last_active_admin: false,
};

const ROLE_DETAIL = {
  id: "role-1",
  name: "SRE",
  slug: "sre",
  description: null,
  is_system: false,
  created_at: "x",
  updated_at: "y",
  permissions: ["assets.read"],
  users: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("listUsers", () => {
  it("builds the query and returns the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(USER_PAGE));
    vi.stubGlobal("fetch", fetchMock);
    const res = await listUsers({ page: 2, q: " ops ", status: "disabled", role: "viewer" });
    expect(res).toEqual({ ok: true, data: USER_PAGE });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/admin/users?");
    expect(url).toContain("page=2");
    expect(url).toContain("q=ops");
    expect(url).toContain("status=disabled");
    expect(url).toContain("role=viewer");
  });

  it("maps 403 to forbidden (distinct from 401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 403)));
    expect(await listUsers()).toEqual({ ok: false, error: { kind: "forbidden" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    expect(await listUsers()).toEqual({ ok: false, error: { kind: "unauthorized" } });
  });
});

describe("mutations", () => {
  it("setUserActive PATCHes is_active and returns the detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(USER_DETAIL));
    vi.stubGlobal("fetch", fetchMock);
    const res = await setUserActive("u1", false);
    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ is_active: false });
  });

  it("setUserRoles maps 409 to a conflict with the server message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "would leave no administrator" }, 409)),
    );
    const res = await setUserRoles("u1", []);
    expect(res).toEqual({
      ok: false,
      error: { kind: "conflict", message: "would leave no administrator" },
    });
  });

  it("createRole posts name + permissions and returns the role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(ROLE_DETAIL, 201));
    vi.stubGlobal("fetch", fetchMock);
    const res = await createRole({ name: "SRE", permissions: ["assets.read"] });
    expect(res).toEqual({ ok: true, data: ROLE_DETAIL });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "SRE",
      permissions: ["assets.read"],
    });
  });

  it("deleteRole succeeds on 200 and maps 409 (in use)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Role deleted" })));
    expect(await deleteRole("role-1")).toEqual({ ok: true, data: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "still assigned" }, 409)));
    expect(await deleteRole("role-1")).toMatchObject({
      ok: false,
      error: { kind: "conflict" },
    });
  });
});

describe("getPermissionCatalog", () => {
  it("returns the grouped catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          groups: ["assets"],
          permissions: [{ code: "assets.read", group: "assets", description: "d" }],
        }),
      ),
    );
    const res = await getPermissionCatalog();
    expect(res).toMatchObject({ ok: true, data: { groups: ["assets"] } });
  });
});
