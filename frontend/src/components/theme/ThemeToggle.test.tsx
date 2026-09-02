import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

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
  it("starts a first-time visitor in dark and offers light as a single labelled button", async () => {
    renderToggle();
    // defaultTheme is "dark" -> the button switches you to light.
    const button = await screen.findByRole("button", { name: toLight });
    expect(button).toBeInTheDocument();
    expect(html()).toHaveClass("dark");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("switches to light and then flips its label to offer dark", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toLight }));

    await waitFor(() => expect(html()).not.toHaveClass("dark"));
    expect(await screen.findByRole("button", { name: toDark })).toBeInTheDocument();
  });

  it("switches back to dark", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toLight }));
    await waitFor(() => expect(html()).not.toHaveClass("dark"));

    await userEvent.click(await screen.findByRole("button", { name: toDark }));
    await waitFor(() => expect(html()).toHaveClass("dark"));
  });

  it("persists an explicit choice to localStorage", async () => {
    renderToggle();
    await userEvent.click(await screen.findByRole("button", { name: toLight }));
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
  });

  it("restores a persisted preference on the next mount", async () => {
    window.localStorage.setItem("theme", "light");
    renderToggle();
    await waitFor(() => expect(html()).not.toHaveClass("dark"));
    expect(await screen.findByRole("button", { name: toDark })).toBeInTheDocument();
  });
});
