import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { setMatchMedia } from "@/test/matchMedia";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const html = () => document.documentElement;
const toDark = /modo oscuro/i;
const toLight = /modo claro/i;

describe("ThemeToggle", () => {
  it("offers the opposite mode as a single labelled button", async () => {
    renderToggle();
    // System resolves to light in tests -> the button switches you to dark.
    const button = await screen.findByRole("button", { name: toDark });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("switches to dark and then flips its label to offer light", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toDark }));

    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(await screen.findByRole("button", { name: toLight })).toBeInTheDocument();
  });

  it("switches back to light", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toDark }));
    await waitFor(() => expect(html()).toHaveClass("dark"));

    await userEvent.click(await screen.findByRole("button", { name: toLight }));
    await waitFor(() => expect(html()).not.toHaveClass("dark"));
  });

  it("persists an explicit choice to localStorage", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toDark }));
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));
  });

  it("restores a persisted preference on the next mount", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    await waitFor(() => expect(html()).toHaveClass("dark"));
    expect(await screen.findByRole("button", { name: toLight })).toBeInTheDocument();
  });

  it("follows the OS preference on first visit (nothing persisted)", async () => {
    setMatchMedia(true); // OS prefers dark
    renderToggle();
    await waitFor(() => expect(html()).toHaveClass("dark"));
    // Dark is active -> the button now offers light.
    expect(await screen.findByRole("button", { name: toLight })).toBeInTheDocument();
  });
});
