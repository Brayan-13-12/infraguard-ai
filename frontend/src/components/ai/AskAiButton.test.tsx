import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AskAiButton } from "@/components/ai/AskAiButton";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => vi.restoreAllMocks());

function renderButton(
  entity: { type: "asset" | "incident"; id: string },
  permissions?: string[],
) {
  const user = permissions ? makeUser({ permissions }) : makeUser();
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <AskAiButton entity={entity} />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

describe("AskAiButton", () => {
  it("links to the AI workspace with the asset id as context", () => {
    renderButton({ type: "asset", id: "a-123" });
    const link = screen.getByRole("link", { name: /preguntar a la ia/i });
    expect(link).toHaveAttribute("href", "/ai?asset_id=a-123");
  });

  it("uses the incident label and param for an incident", () => {
    renderButton({ type: "incident", id: "i-9" });
    const link = screen.getByRole("link", { name: /analizar con ia/i });
    expect(link).toHaveAttribute("href", "/ai?incident_id=i-9");
  });

  it("renders nothing without the ai.use permission", () => {
    renderButton({ type: "asset", id: "a1" }, ["assets.read"]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
