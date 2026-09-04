import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Composer } from "@/components/ai/Composer";
import { LanguageProvider } from "@/i18n";

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  render(
    <LanguageProvider>
      <Composer onSend={onSend} maxLength={20} {...props} />
    </LanguageProvider>,
  );
  return { onSend };
}

afterEach(() => vi.restoreAllMocks());

describe("Composer", () => {
  it("sends on Enter and clears the field", async () => {
    const { onSend } = renderComposer();
    const box = screen.getByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "hola{Enter}");
    expect(onSend).toHaveBeenCalledWith("hola");
    expect(box).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter without sending", async () => {
    const { onSend } = renderComposer();
    const box = screen.getByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "linea uno{Shift>}{Enter}{/Shift}linea dos");
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("linea uno\nlinea dos");
  });

  it("blocks sending past the character limit", async () => {
    const { onSend } = renderComposer();
    const box = screen.getByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "esto es claramente mas largo que veinte");
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/supera el máximo/i)).toBeInTheDocument();
  });

  it("does not send while a previous send is in flight", async () => {
    const { onSend } = renderComposer({ sending: true });
    const box = screen.getByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "hola{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
