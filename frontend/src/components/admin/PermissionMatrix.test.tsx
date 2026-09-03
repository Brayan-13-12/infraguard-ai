import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { LanguageProvider } from "@/i18n";
import type { PermissionRead } from "@/types/rbac";

const CATALOG: PermissionRead[] = [
  { code: "assets.read", group: "assets", description: "List assets" },
  { code: "assets.create", group: "assets", description: "Create assets" },
  { code: "audit.read", group: "audit", description: "Read the audit log" },
];

function renderMatrix(props: Partial<React.ComponentProps<typeof PermissionMatrix>> = {}) {
  return render(
    <LanguageProvider>
      <PermissionMatrix
        catalog={CATALOG}
        selected={props.selected ?? new Set()}
        onToggle={props.onToggle}
        readOnly={props.readOnly}
      />
    </LanguageProvider>,
  );
}

describe("PermissionMatrix", () => {
  it("groups permissions and shows a friendly label + the machine code", () => {
    renderMatrix();
    expect(screen.getByText("Activos")).toBeInTheDocument();
    expect(screen.getByText("Auditoría")).toBeInTheDocument();
    expect(screen.getByText("Ver activos")).toBeInTheDocument();
    expect(screen.getByText("assets.read")).toBeInTheDocument();
  });

  it("reflects the selected set and toggles", async () => {
    const onToggle = vi.fn();
    renderMatrix({ selected: new Set(["assets.read"]), onToggle });
    const readBox = screen.getByRole("checkbox", { name: /ver activos/i });
    expect(readBox).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /crear activos/i }));
    expect(onToggle).toHaveBeenCalledWith("assets.create", true);
  });

  it("disables every checkbox in readOnly mode", () => {
    renderMatrix({ selected: new Set(["audit.read"]), readOnly: true });
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toBeDisabled();
    }
  });
});
