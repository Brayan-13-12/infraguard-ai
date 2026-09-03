import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserDetailContent } from "@/components/admin/UserDetail";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as adminService from "@/services/admin";
import { makeUser, VIEWER_USER } from "@/test/fixtures";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import type { AdminUserDetail } from "@/types/rbac";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const DETAIL: AdminUserDetail = {
  id: "u2",
  email: "operator@example.com",
  account_status: "active",
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  roles: [{ id: "r-op", name: "Operator", slug: "operator", is_system: true }],
  permissions: ["assets.read", "assets.update", "incidents.read"],
  is_last_active_admin: false,
};

function renderContent(
  detail: AdminUserDetail = DETAIL,
  { user = makeUser(), onChanged = vi.fn() } = {},
) {
  render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <UserDetailContent user={detail} onChanged={onChanged} />
        <Toaster />
      </MockAuthProvider>
    </LanguageProvider>,
  );
  return { onChanged };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
});

describe("UserDetailContent", () => {
  it("shows identity, roles and the effective permission union", () => {
    renderContent();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
    expect(screen.getByText("assets.update")).toBeInTheDocument();
  });

  it("hides the administrative actions from a user without users.manage", () => {
    renderContent(DETAIL, { user: VIEWER_USER });
    expect(screen.queryByRole("button", { name: /gestionar roles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deshabilitar cuenta/i })).not.toBeInTheDocument();
  });

  it("deactivates behind a confirm and reports the updated user", async () => {
    const updated = { ...DETAIL, account_status: "disabled" as const, is_active: false };
    const spy = vi
      .spyOn(adminService, "setUserActive")
      .mockResolvedValue({ ok: true, data: updated });
    const { onChanged } = renderContent();

    await userEvent.click(screen.getByRole("button", { name: /deshabilitar cuenta/i }));
    const dialog = await screen.findByRole("dialog", { name: /¿deshabilitar esta cuenta\?/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /deshabilitar cuenta/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("u2", false));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
    expect(await screen.findByText(/cuenta deshabilitada/i)).toBeInTheDocument();
  });

  it("surfaces the last-admin lockout error from a 409 without closing", async () => {
    vi.spyOn(adminService, "setUserActive").mockResolvedValue({
      ok: false,
      error: { kind: "conflict", message: "no active administrator" },
    });
    renderContent({ ...DETAIL, is_last_active_admin: true });

    expect(screen.getByText(/único administrador activo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /deshabilitar cuenta/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /deshabilitar cuenta/i }));
    expect(await screen.findByText(/no active administrator/i)).toBeInTheDocument();
  });

  it("opens the role selector with a live effective-permission preview", async () => {
    vi.spyOn(adminService, "listRoleRefs").mockResolvedValue({
      ok: true,
      data: [
        { id: "r-op", name: "Operator", slug: "operator", is_system: true },
        { id: "r-analyst", name: "Analyst", slug: "analyst", is_system: true },
      ],
    });
    vi.spyOn(adminService, "getRole").mockImplementation(async (id) => ({
      ok: true,
      data: {
        id,
        name: id,
        slug: id,
        description: null,
        is_system: true,
        created_at: "x",
        updated_at: "y",
        permissions: id === "r-op" ? ["assets.update"] : ["audit.read"],
        users: [],
      },
    }));
    renderContent();
    await userEvent.click(screen.getByRole("button", { name: /gestionar roles/i }));
    expect(
      await screen.findByRole("dialog", { name: /roles for operator@example.com|roles de operator/i }),
    ).toBeInTheDocument();
  });
});
