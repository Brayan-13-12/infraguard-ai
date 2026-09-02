import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { LanguageProvider } from "@/i18n";
import type { AssetStatus, Criticality } from "@/types/asset";

function renderCriticality(value: Criticality) {
  return render(
    <LanguageProvider>
      <CriticalityBadge value={value} />
    </LanguageProvider>,
  );
}

describe("CriticalityBadge - severity hierarchy", () => {
  it.each([
    ["Critical", "Crítica", "text-danger"],
    ["High", "Alta", "text-warning"],
    ["Medium", "Media", "text-caution"],
    ["Low", "Baja", "text-success"],
  ] as [Criticality, string, string][])(
    "%s renders the %s label with the %s tone",
    (value, label, toneClass) => {
      renderCriticality(value);
      const badge = screen.getByText(label);
      expect(badge).toHaveClass(toneClass);
    },
  );

  it("Medium is NOT a neutral/gray badge and stays distinct from High", () => {
    renderCriticality("Medium");
    const medium = screen.getByText("Media");
    expect(medium).toHaveClass("text-caution");
    expect(medium).not.toHaveClass("text-muted-foreground");
    expect(medium).not.toHaveClass("text-warning"); // not the same as High
  });

  it("keeps the translated label visible in English", () => {
    // LanguageProvider default is Spanish; assert the key resolves for both.
    render(
      <LanguageProvider>
        <CriticalityBadge value="Medium" />
      </LanguageProvider>,
    );
    expect(screen.getByText("Media")).toBeInTheDocument();
  });
});

describe("AssetStatusBadge", () => {
  it.each([
    ["Operational", "Operativo", "text-success"],
    ["Degraded", "Degradado", "text-warning"],
    ["Maintenance", "Mantenimiento", "text-info"],
    ["Offline", "Fuera de servicio", "text-danger"],
  ] as [AssetStatus, string, string][])(
    "%s renders the %s label with the %s tone",
    (value, label, toneClass) => {
      render(
        <LanguageProvider>
          <AssetStatusBadge value={value} />
        </LanguageProvider>,
      );
      expect(screen.getByText(label)).toHaveClass(toneClass);
    },
  );
});
