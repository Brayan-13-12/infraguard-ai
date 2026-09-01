import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LanguageProvider, useTranslation } from "@/i18n";
import { LANGUAGE_STORAGE_KEY } from "@/i18n/config";

function Probe() {
  const { language, setLanguage, t } = useTranslation();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="title">{t("auth.loginTitle")}</span>
      <span data-testid="hint">{t("auth.passwordHint", { min: 12 })}</span>
      <span data-testid="missing">
        {(t as (key: string) => string)("nope.not.here")}
      </span>
      <button onClick={() => setLanguage("en")}>en</button>
      <button onClick={() => setLanguage("es")}>es</button>
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
  it("defaults to Spanish and interpolates variables", () => {
    renderProbe();
    expect(screen.getByTestId("lang")).toHaveTextContent("es");
    expect(screen.getByTestId("title")).toHaveTextContent("Iniciar sesión");
    expect(screen.getByTestId("hint")).toHaveTextContent("Al menos 12 caracteres");
  });

  it("returns the key when it cannot be resolved", () => {
    renderProbe();
    expect(screen.getByTestId("missing")).toHaveTextContent("nope.not.here");
  });

  it("switches language, updates <html lang> and persists the choice", async () => {
    renderProbe();
    await userEvent.click(screen.getByRole("button", { name: "en" }));

    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("Sign in"));
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("restores a persisted language on mount", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("en"));
    expect(screen.getByTestId("title")).toHaveTextContent("Sign in");
  });

  it("works without a provider - a Spanish fallback translator", () => {
    render(<Probe />);
    expect(screen.getByTestId("title")).toHaveTextContent("Iniciar sesión");
  });
});
