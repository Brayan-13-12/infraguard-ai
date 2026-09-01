import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/components/AuthForm";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const GOOD_PW = "a-perfectly-good-passphrase";

describe("AuthForm (register mode)", () => {
  it("blocks submission and shows field errors for invalid input", async () => {
    const onSubmit = vi.fn();
    render(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
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
    render(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), GOOD_PW);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(onSubmit).toHaveBeenCalledWith("new@example.com", GOOD_PW);
    expect(onSuccess).toHaveBeenCalledWith(user);
  });

  it("shows a form-level alert when the server rejects a duplicate email", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: "conflict", message: "That email is already registered." } });
    render(<AuthForm mode="register" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), GOOD_PW);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already registered/i);
  });
});

describe("AuthForm (login mode)", () => {
  it("shows a generic error on invalid credentials", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "invalid_credentials", message: "Invalid email or password." },
    });
    render(<AuthForm mode="login" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "whatever");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
  });

  it("shows a connectivity error when the backend is unreachable", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: "unreachable", message: "Could not reach the server. Check your connection and try again." },
    });
    render(<AuthForm mode="login" onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "whatever");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/i);
  });
});
