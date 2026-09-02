import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditChangePreview } from "@/components/audit/AuditChangePreview";
import { LanguageProvider } from "@/i18n";
import type { AuditChange } from "@/types/audit";

function renderPreview(changes: AuditChange[], changeCount: number) {
  return render(
    <LanguageProvider>
      <AuditChangePreview changes={changes} changeCount={changeCount} />
    </LanguageProvider>,
  );
}

describe("AuditChangePreview", () => {
  it("renders short changes as antes -> después", () => {
    renderPreview([{ field_name: "owner", old_value: "Platform Team", new_value: "SRE Team" }], 1);
    expect(screen.getByText("Owner:")).toBeInTheDocument();
    expect(screen.getByText("Platform Team")).toBeInTheDocument();
    expect(screen.getByText("SRE Team")).toBeInTheDocument();
  });

  it("collapses a long value to '{field} modificado'", () => {
    renderPreview(
      [{ field_name: "hostname", old_value: "a", new_value: "x".repeat(80) }],
      1,
    );
    expect(screen.getByText("Hostname modificado")).toBeInTheDocument();
    expect(screen.queryByText("x".repeat(80))).not.toBeInTheDocument();
  });

  it("never previews a known prose field inline", () => {
    renderPreview([{ field_name: "description", old_value: "old", new_value: "new" }], 1);
    expect(screen.getByText("Description modificado")).toBeInTheDocument();
  });

  it("renders is_active as Activado / Desactivado", () => {
    renderPreview([{ field_name: "is_active", old_value: "true", new_value: "false" }], 1);
    expect(screen.getByText("Desactivado")).toBeInTheDocument();
  });

  it("shows a '+N cambios más' line when the preview is partial", () => {
    renderPreview(
      [
        { field_name: "a", old_value: "1", new_value: "2" },
        { field_name: "b", old_value: "1", new_value: "2" },
        { field_name: "c", old_value: "1", new_value: "2" },
      ],
      6,
    );
    expect(screen.getByText("+3 cambios más")).toBeInTheDocument();
  });

  it("shows nothing extra when the preview is complete", () => {
    renderPreview([{ field_name: "a", old_value: "1", new_value: "2" }], 1);
    expect(screen.queryByText(/cambios más/i)).not.toBeInTheDocument();
  });
});
