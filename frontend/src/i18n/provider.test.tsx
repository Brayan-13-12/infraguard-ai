import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguageProvider, useTranslation } from "@/i18n";

function Probe() {
  const { language, t } = useTranslation();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="title">{t("auth.loginTitle")}</span>
      <span data-testid="hint">{t("auth.passwordHint", { min: 12 })}</span>
      <span data-testid="missing">
        {(t as (key: string) => string)("nope.not.here")}
      </span>
    </div>
  );
}

function renderProbe() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

describe("LanguageProvider / useTranslation", () => {
  it("renders Spanish and interpolates variables", () => {
    renderProbe();
    expect(screen.getByTestId("lang")).toHaveTextContent("es");
    expect(screen.getByTestId("title")).toHaveTextContent("Iniciar sesión");
    expect(screen.getByTestId("hint")).toHaveTextContent("Al menos 12 caracteres");
  });

  it("returns the key when it cannot be resolved", () => {
    renderProbe();
    expect(screen.getByTestId("missing")).toHaveTextContent("nope.not.here");
  });

  it("works without a provider - the Spanish translator is the default", () => {
    render(<Probe />);
    expect(screen.getByTestId("title")).toHaveTextContent("Iniciar sesión");
    expect(screen.getByTestId("lang")).toHaveTextContent("es");
  });
});
