import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetForm } from "@/components/assets/AssetForm";
import { LanguageProvider } from "@/i18n";
import type { Asset } from "@/types/asset";

const ASSET: Asset = {
  id: "a1",
  name: "web-01",
  asset_type: "Server",
  environment: "Staging",
  criticality: "High",
  status: "Degraded",
  hostname: "web-01.internal",
  ip_address: "10.0.0.5",
  owner: "platform-team",
  description: "front door",
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function renderForm(props: Partial<React.ComponentProps<typeof AssetForm>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue({ ok: true, data: ASSET });
  const onSuccess = props.onSuccess ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <LanguageProvider>
      <AssetForm mode="create" onSubmit={onSubmit} onSuccess={onSuccess} onCancel={onCancel} {...props} />
    </LanguageProvider>,
  );
  return { onSubmit, onSuccess, onCancel };
}

describe("AssetForm", () => {
  it("renders the catalog fields (Spanish by default)", () => {
    renderForm();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Entorno")).toBeInTheDocument();
    expect(screen.getByLabelText("Criticidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
  });

  it("blocks submit and shows an error when the name is empty", async () => {
    const { onSubmit } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: /crear activo/i }));
    expect(await screen.findByText(/el nombre es obligatorio/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an invalid IP address client-side", async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(screen.getByLabelText("Nombre"), "db-01");
    await userEvent.type(screen.getByLabelText(/dirección ip/i), "10.0.0.999");
    await userEvent.click(screen.getByRole("button", { name: /crear activo/i }));
    expect(await screen.findByText(/dirección ipv4 o ipv6 válida/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a normalised payload and calls onSuccess", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: ASSET });
    const { onSuccess } = renderForm({ onSubmit });

    await userEvent.type(screen.getByLabelText("Nombre"), "  api-gw  ");
    await userEvent.selectOptions(screen.getByLabelText("Entorno"), "Production");
    await userEvent.type(screen.getByLabelText(/responsable/i), " sre ");
    await userEvent.click(screen.getByRole("button", { name: /crear activo/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "api-gw",
        environment: "Production",
        owner: "sre",
        hostname: null,
        ip_address: null,
      }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ASSET));
  });

  it("surfaces server-side field errors", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "validation", fields: { name: "already taken by the server" } },
    });
    renderForm({ onSubmit });
    await userEvent.type(screen.getByLabelText("Nombre"), "dup");
    await userEvent.click(screen.getByRole("button", { name: /crear activo/i }));
    expect(await screen.findByText(/already taken by the server/i)).toBeInTheDocument();
  });

  it("prefills every field in edit mode and can be cancelled", async () => {
    const { onCancel } = renderForm({ mode: "edit", initial: ASSET });
    expect(screen.getByLabelText("Nombre")).toHaveValue("web-01");
    expect(screen.getByLabelText(/dirección ip/i)).toHaveValue("10.0.0.5");
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
