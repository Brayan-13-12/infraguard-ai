import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LanguageProvider } from "@/i18n";
import { LANGUAGE_STORAGE_KEY } from "@/i18n/config";

function renderSwitcher() {
  return render(
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>,
  );
}

describe("LanguageSwitcher", () => {
  it("is a labelled group with ES active by default", () => {
    renderSwitcher();
    expect(screen.getByRole("group", { name: /cambiar idioma/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches language and persists the choice", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });
});
