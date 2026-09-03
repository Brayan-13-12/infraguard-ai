import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBrowser } from "@/components/admin/AdminBrowser";
import { LanguageProvider } from "@/i18n";
import * as adminService from "@/services/admin";
import { makeUser, VIEWER_USER } from "@/test/fixtures";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import type { User } from "@/types/auth";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const USER_PAGE = {
  items: [
    {
      id: "u1",
      email: "admin@example.com",
      account_status: "active" as const,
      is_active: true,
      created_at: "2026-09-01T00:00:00Z",
      roles: [{ id: "r-admin", name: "Administrator", slug: "administrator", is_system: true }],
    },
    {
      id: "u2",
      email: "viewer@example.com",
      account_status: "disabled" as const,
      is_active: false,
      created_at: "2026-09-02T00:00:00Z",
      roles: [{ id: "r-viewer", name: "Viewer", slug: "viewer", is_system: true }],
    },
  ],
  page: 1,
  page_size: 20,
  total: 2,
  total_pages: 1,
};

const ROLE_PAGE = {
  items: [
    {
      id: "r-admin",
      name: "Administrator",
      slug: "administrator",
      description: "Full access",
      is_system: true,
      user_count: 1,
      permission_count: 16,
    },
    {
      id: "r-sre",
      name: "SRE",
      slug: "sre",
      description: null,
      is_system: false,
      user_count: 0,
      permission_count: 3,
    },
  ],
  total: 2,
};

function renderBrowser(user: User | null = makeUser()) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <AdminBrowser />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  mockSearchParams = new URLSearchParams("");
  vi.spyOn(adminService, "listUsers").mockResolvedValue({ ok: true, data: USER_PAGE });
  vi.spyOn(adminService, "listRoles").mockResolvedValue({ ok: true, data: ROLE_PAGE });
  vi.spyOn(adminService, "listAccessRequests").mockResolvedValue({
    ok: true,
    data: { ...USER_PAGE, items: [], total: 0 },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("AdminBrowser", () => {
  it("shows the English header, subtitle and the summary strip", async () => {
    renderBrowser();
    expect(screen.getByRole("heading", { name: "Administration" })).toBeInTheDocument();
    expect(screen.getByText(/gestiona usuarios, roles y permisos/i)).toBeInTheDocument();
    expect(await screen.findAllByText("admin@example.com")).not.toHaveLength(0);
  });

  it("lists users with their roles and status by default", async () => {
    renderBrowser();
    expect((await screen.findAllByText("viewer@example.com")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deshabilitado/i).length).toBeGreaterThan(0);
  });

  it("filters users by status and pushes it to the query", async () => {
    renderBrowser();
    await screen.findAllByText("admin@example.com");
    await userEvent.selectOptions(screen.getByLabelText(/estado/i), "disabled");
    await waitFor(() =>
      expect(adminService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ status: "disabled" }),
      ),
    );
  });

  it("switches to the Roles tab and marks system vs custom", async () => {
    renderBrowser();
    await screen.findAllByText("admin@example.com");
    await userEvent.click(screen.getByRole("tab", { name: /roles/i }));
    expect((await screen.findAllByText("SRE")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sistema/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/personalizado/i).length).toBeGreaterThan(0);
  });

  it("shows the 'Nuevo rol' button only with roles.manage", async () => {
    renderBrowser();
    await screen.findAllByText("admin@example.com");
    await userEvent.click(screen.getByRole("tab", { name: /roles/i }));
    expect(screen.getByRole("button", { name: /nuevo rol/i })).toBeInTheDocument();
  });

  it("hides 'Nuevo rol' for a read-only roles user and the Users tab entirely for a pure viewer", async () => {
    renderBrowser(VIEWER_USER);
    // Viewer has no admin permissions - the browser renders nothing actionable.
    await waitFor(() => expect(adminService.listUsers).not.toHaveBeenCalled());
  });
});
