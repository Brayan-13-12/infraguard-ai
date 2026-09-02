import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Toaster, clearToasts, toast } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";

function renderToaster() {
  return render(
    <LanguageProvider>
      <Toaster />
    </LanguageProvider>,
  );
}

afterEach(() => clearToasts());

describe("toast / Toaster", () => {
  it("shows a toast pushed from anywhere, as a status by default", async () => {
    renderToaster();
    act(() => {
      toast({ title: "Guardado", description: "Los cambios se guardaron." });
    });
    const item = await screen.findByRole("status");
    expect(item).toHaveTextContent("Guardado");
    expect(item).toHaveTextContent("Los cambios se guardaron.");
  });

  it("uses role=alert for important errors", async () => {
    renderToaster();
    act(() => {
      toast({ description: "Algo falló", tone: "danger", important: true });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló");
  });

  it("can be dismissed manually", async () => {
    renderToaster();
    act(() => {
      toast({ description: "Cerrable", durationMs: 0 });
    });
    await screen.findByText("Cerrable");
    await userEvent.click(screen.getByRole("button", { name: /descartar notificación/i }));
    await waitFor(() => expect(screen.queryByText("Cerrable")).not.toBeInTheDocument());
  });

  it("auto-dismisses after its duration", async () => {
    renderToaster();
    act(() => {
      toast({ description: "Efímera", durationMs: 50 });
    });
    await screen.findByText("Efímera");
    await waitFor(() => expect(screen.queryByText("Efímera")).not.toBeInTheDocument(), {
      timeout: 1000,
    });
  });
});
