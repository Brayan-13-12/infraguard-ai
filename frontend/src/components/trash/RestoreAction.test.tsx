import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RestoreAction } from "@/components/trash/RestoreAction";
import { Toaster, clearToasts } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import * as trashRefresh from "@/lib/trashRefresh";
import * as trashService from "@/services/trash";

function renderAction(kind: "assets" | "incidents", onRestored = vi.fn()) {
  render(
    <LanguageProvider>
      <RestoreAction kind={kind} id="x1" label="prod-api-01" onRestored={onRestored} />
      <Toaster />
    </LanguageProvider>,
  );
  return { onRestored };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
});

describe("RestoreAction", () => {
  it("restores an asset only after the confirm step, then toasts and notifies", async () => {
    const restore = vi
      .spyOn(trashService, "restoreTrashAsset")
      .mockResolvedValue({ ok: true, data: null });
    const notify = vi.spyOn(trashRefresh, "notifyTrashChanged");
    const { onRestored } = renderAction("assets");

    await userEvent.click(screen.getByRole("button", { name: /restaurar/i }));
    expect(restore).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: /¿restaurar activo\?/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /^restaurar$/i }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith("x1"));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith({ scope: "assets" });
    expect(await screen.findByText(/activo restaurado correctamente/i)).toBeInTheDocument();
  });

  it("keeps the dialog open and shows an error when restore fails", async () => {
    vi.spyOn(trashService, "restoreTrashIncident").mockResolvedValue({
      ok: false,
      error: { kind: "unreachable" },
    });
    const { onRestored } = renderAction("incidents");

    await userEvent.click(screen.getByRole("button", { name: /restaurar/i }));
    const dialog = await screen.findByRole("dialog", { name: /¿restaurar incidente\?/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /^restaurar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo restaurar/i);
    expect(onRestored).not.toHaveBeenCalled();
  });
});
