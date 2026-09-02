import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/i18n";
import * as auditService from "@/services/audit";
import type { AuditEventDetail } from "@/types/audit";

import InterceptedAuditModal from "./@modal/(.)[id]/page";

let params: Record<string, string> = {};
const back = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ back, replace, push: vi.fn() }),
  usePathname: () => "/audit/e1",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const DETAIL: AuditEventDetail = {
  id: "e1",
  occurred_at: "2026-09-02T10:00:00Z",
  action: "UPDATE",
  entity_type: "Asset",
  entity_id: "a1",
  entity_label: "payments-db",
  actor_user_id: "u1",
  actor_email: "ops@example.com",
  request_id: "req-1",
  ip_address: null,
  user_agent: null,
  metadata: null,
  changes: [{ field_name: "status", old_value: "Operational", new_value: "Degraded" }],
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => {
  window.history.pushState({}, "", "/audit/e1");
  params = { id: "e1" };
});

afterEach(() => {
  vi.restoreAllMocks();
  back.mockReset();
  params = {};
});

describe("audit @modal/(.)[id] interceptor", () => {
  it("renders the detail workspace for a real id and fetches that event", async () => {
    const getAudit = vi
      .spyOn(auditService, "getAudit")
      .mockResolvedValue({ ok: true, data: DETAIL });

    renderWithProviders(<InterceptedAuditModal />);

    await waitFor(() => expect(getAudit).toHaveBeenCalledWith("e1"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toMatch(/w-\[min\(1100px/); // the large "workspace" variant
    expect(await screen.findByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows a not-found state without crashing", async () => {
    vi.spyOn(auditService, "getAudit").mockResolvedValue({
      ok: false,
      error: { kind: "not_found" },
    });

    renderWithProviders(<InterceptedAuditModal />);

    expect(await screen.findByText("Evento no encontrado")).toBeInTheDocument();
  });
});
