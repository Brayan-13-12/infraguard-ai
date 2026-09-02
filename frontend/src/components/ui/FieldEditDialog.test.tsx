import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FieldEditDialog, type FieldSaveResult } from "@/components/ui/FieldEditDialog";
import { LanguageProvider } from "@/i18n";

function Harness({
  onSave,
  kind = "text" as const,
  optional = false,
  validate,
}: {
  onSave: (v: string) => Promise<FieldSaveResult>;
  kind?: "text" | "textarea" | "select";
  optional?: boolean;
  validate?: (v: string) => string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <LanguageProvider>
      <FieldEditDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Editar responsable"
        kind={kind}
        initialValue={kind === "select" ? "b" : "old"}
        options={
          kind === "select"
            ? [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ]
            : undefined
        }
        optional={optional}
        validate={validate}
        onSave={onSave}
      />
    </LanguageProvider>
  );
}

describe("FieldEditDialog", () => {
  it("is a labelled dialog with the current value pre-filled", () => {
    render(<Harness onSave={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Editar responsable" });
    expect(within(dialog).getByRole("textbox")).toHaveValue("old");
  });

  it("saves the new value and closes on success", async () => {
    const onSave = vi.fn<(v: string) => Promise<FieldSaveResult>>().mockResolvedValue({ ok: true });
    render(<Harness onSave={onSave} />);
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "new-team");
    await userEvent.click(within(dialog).getByRole("button", { name: /guardar/i }));

    expect(onSave).toHaveBeenCalledWith("new-team");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and shows the error when the save fails", async () => {
    const onSave = vi
      .fn<(v: string) => Promise<FieldSaveResult>>()
      .mockResolvedValue({ ok: false, error: "El servidor rechazó el cambio." });
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/rechazó el cambio/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("blocks a required field from being cleared, and runs client validation", async () => {
    const onSave = vi.fn<(v: string) => Promise<FieldSaveResult>>();
    render(
      <Harness onSave={onSave} validate={(v) => (v === "bad" ? "Valor no válido." : null)} />,
    );
    const input = screen.getByRole("textbox");

    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/obligatorio/i);

    await userEvent.type(input, "bad");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/no válido/i);
  });

  it("cancel closes without calling onSave", async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });
});
