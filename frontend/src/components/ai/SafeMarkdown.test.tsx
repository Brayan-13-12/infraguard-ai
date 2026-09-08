import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

it("renders emphasis, code and semantic lists while leaving HTML and URLs inert", () => {
  const { container } = render(<SafeMarkdown text={'**Observed**\n- `prod-db`\n- API\n\n1. Check database\n2. Check API\n<script>alert(1)</script>\n![leak](https://evil.invalid/pixel)\n[click](javascript:alert(1))'} />);
  expect(screen.getByText("Observed").tagName).toBe("STRONG");
  expect(screen.getByText("prod-db").tagName).toBe("CODE");
  expect(screen.getAllByRole("list")).toHaveLength(2);
  expect(container.querySelector("script, img, a, iframe")).toBeNull();
});
