import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tabs, tabPanelProps } from "@/components/ui/Tabs";

function Harness() {
  const tabs = [
    { id: "a", label: "Resumen" },
    { id: "b", label: "Activos", badge: 3 },
    { id: "c", label: "Actividad" },
  ];
  const [value, setValue] = useState("a");
  return (
    <>
      <Tabs tabs={tabs} value={value} onChange={setValue} idBase="t" />
      {tabs.map((tab) => (
        <div key={tab.id} {...tabPanelProps("t", tab.id)} hidden={value !== tab.id}>
          panel {tab.id}
        </div>
      ))}
    </>
  );
}

describe("Tabs", () => {
  it("exposes an ARIA tablist with roving tabindex and controls its panels", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist");
    expect(list).toHaveAttribute("aria-orientation", "horizontal");
    const [a, b] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("aria-selected", "true");
    expect(a).toHaveAttribute("tabindex", "0");
    expect(b).toHaveAttribute("tabindex", "-1");
    expect(a).toHaveAttribute("aria-controls", "t-panel-a");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
  });

  it("switches on click and on arrow keys", async () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");

    await userEvent.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");

    tabs[1]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{Home}");
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("renders a count badge", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /activos/i })).toHaveTextContent("3");
  });
});
