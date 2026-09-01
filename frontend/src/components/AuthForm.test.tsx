import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/components/AuthForm";
import { LanguageProvider } from "@/i18n";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const GOOD_PW = "a-perfectly-good-passphrase";

function renderForm(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

const EMAIL = "Correo electrónico";
const PASSWORD = "Contraseña";

describe("AuthForm (register mode)", () => {
  it("blocks submission and shows field errors for invalid input", async () => {
    const onSubmit = vi.fn();
    renderForm(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(EMAIL), "not-an-email");
    await userEvent.type(screen.getByLabelText(PASSWORD), "short");
    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/correo electrónico válido/i)).toBeInTheDocument();
    expect(screen.getByText(/al menos 12 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid input and calls onSuccess", async () => {
    const user = {
      id: "u1",
      email: "new@example.com",
      is_active: true,
      created_at: "2026-08-31T00:00:00Z",
    };
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: user });
    const onSuccess = vi.fn();
    renderForm(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(EMAIL), "new@example.com");
    await userEvent.type(screen.getByLabelText(PASSWORD), GOOD_PW);
    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(onSubmit).toHaveBeenCalledWith("new@example.com", GOOD_PW);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
  });

  it("shows a form-level alert when the server rejects a duplicate email", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "conflict", message: "dup" },
    });
    renderForm(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(EMAIL), "taken@example.com");
    await userEvent.type(screen.getByLabelText(PASSWORD), GOOD_PW);
    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya está registrado/i);
  });

  it("toggles password visibility without changing the value", async () => {
    renderForm(<AuthForm mode="register" onSubmit={vi.fn()} onSuccess={vi.fn()} />);
    const password = screen.getByLabelText(PASSWORD);

    await userEvent.type(password, GOOD_PW);
    expect(password).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue(GOOD_PW);

    await userEvent.click(screen.getByRole("button", { name: /ocultar contraseña/i }));
    expect(password).toHaveAttribute("type", "password");
  });
});

describe("AuthForm (login mode)", () => {
  it("shows a generic error on invalid credentials", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "invalid_credentials", message: "x" },
    });
    renderForm(<AuthForm mode="login" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(EMAIL), "user@example.com");
    await userEvent.type(screen.getByLabelText(PASSWORD), "whatever");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/contraseña incorrectos/i);
  });

  it("shows a connectivity error when the backend is unreachable", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "x" },
    });
    renderForm(<AuthForm mode="login" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(EMAIL), "user@example.com");
    await userEvent.type(screen.getByLabelText(PASSWORD), "whatever");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo conectar con el servidor/i,
    );
  });

  it("has no password hint in login mode", () => {
    renderForm(<AuthForm mode="login" onSubmit={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/al menos 12 caracteres/i)).not.toBeInTheDocument();
  });
});
