import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoleDetailContent } from "@/components/admin/RoleDetail";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as adminService from "@/services/admin";
import { makeUser, VIEWER_USER } from "@/test/fixtures";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import type { RoleDetail } from "@/types/rbac";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const CUSTOM: RoleDetail = {
  id: "r-sre",
  name: "SRE Operator",
  slug: "sre-operator",
  description: "On-call",
  is_system: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  permissions: ["assets.read", "incidents.read"],
  users: [],
};

const SYSTEM: RoleDetail = {
  ...CUSTOM,
  id: "r-viewer",
  name: "Viewer",
  slug: "viewer",
  is_system: true,
};

function renderRole(role: RoleDetail, { user = makeUser() } = {}) {
  const onChanged = vi.fn();
  const onDeleted = vi.fn();
  render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <RoleDetailContent role={role} onChanged={onChanged} onDeleted={onDeleted} />
        <Toaster />
      </MockAuthProvider>
    </LanguageProvider>,
  );
  return { onChanged, onDeleted };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
});

describe("RoleDetailContent", () => {
  it("shows the tabs and the summary fields for a custom role", () => {
    renderRole(CUSTOM);
    expect(screen.getByRole("tab", { name: /resumen/i })).toBeInTheDocument();
    expect(screen.getByText("SRE Operator")).toBeInTheDocument();
    expect(screen.getByText(/personalizado/i)).toBeInTheDocument();
  });

  it("shows the immutable notice and no edit/delete for a system role", () => {
    renderRole(SYSTEM);
    expect(screen.getByText(/es un rol del sistema/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar rol/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar rol/i })).not.toBeInTheDocument();
  });

  it("hides edit/delete for a user without roles.manage", () => {
    renderRole(CUSTOM, { user: VIEWER_USER });
    expect(screen.queryByRole("button", { name: /editar rol/i })).not.toBeInTheDocument();
  });

  it("deletes an unused custom role behind a confirm", async () => {
    const spy = vi.spyOn(adminService, "deleteRole").mockResolvedValue({ ok: true, data: null });
    const { onDeleted } = renderRole(CUSTOM);

    await userEvent.click(screen.getByRole("button", { name: /eliminar rol/i }));
    const dialog = await screen.findByRole("dialog", { name: /¿eliminar el rol/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /^eliminar$/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("r-sre"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await screen.findByText(/rol eliminado/i)).toBeInTheDocument();
  });

  it("surfaces a 409 (role in use) without deleting", async () => {
    vi.spyOn(adminService, "deleteRole").mockResolvedValue({
      ok: false,
      error: { kind: "conflict", message: "still assigned to 2 users" },
    });
    const { onDeleted } = renderRole({ ...CUSTOM, users: [
      { id: "u1", email: "a@example.com", is_active: true },
      { id: "u2", email: "b@example.com", is_active: true },
    ] });

    await userEvent.click(screen.getByRole("button", { name: /eliminar rol/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^eliminar$/i }));

    expect(await screen.findByText(/still assigned to 2 users/i)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
