import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { LanguageProvider } from "@/i18n";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <LanguageProvider>
      <button onClick={() => setOpen(true)}>abrir</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Título del diálogo"
        description="Una descripción."
      >
        <p>Contenido</p>
        <button>interno</button>
      </Dialog>
    </LanguageProvider>
  );
}

describe("Dialog / Overlay", () => {
  it("is closed until opened, then exposes a labelled modal dialog", async () => {
    render(<DialogHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "abrir" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Título del diálogo");
    expect(dialog).toHaveAccessibleDescription("Una descripción.");
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "abrir" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on a backdrop click and via the close button", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "abrir" }));
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

function ConfirmHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <LanguageProvider>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        title="¿Continuar?"
        description="Esto no se puede deshacer."
        confirmLabel="Confirmar"
        tone="danger"
      />
    </LanguageProvider>
  );
}

describe("ConfirmDialog", () => {
  it("runs the confirm action on confirm and closes on cancel", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog")).toHaveAccessibleName("¿Continuar?");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
