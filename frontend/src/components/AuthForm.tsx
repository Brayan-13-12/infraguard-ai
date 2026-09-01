"use client";

import Link from "next/link";
import { useState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/config";
import { CredentialErrors, validateLogin, validateRegistration } from "@/lib/validation";
import type { AuthFailure, AuthResult, User } from "@/types/auth";

interface AuthFormProps {
  mode: "login" | "register";
  onSubmit: (email: string, password: string) => Promise<AuthResult<User>>;
  onSuccess: (user: User) => void;
}

const COPY = {
  login: {
    title: "Sign in",
    submit: "Sign in",
    alt: "Need an account?",
    altHref: "/register",
    altLabel: "Create one",
  },
  register: {
    title: "Create your account",
    submit: "Create account",
    alt: "Already registered?",
    altHref: "/login",
    altLabel: "Sign in",
  },
} as const;

function formError(failure: AuthFailure): string | null {
  switch (failure.kind) {
    case "invalid_credentials":
    case "conflict":
    case "rate_limited":
    case "unreachable":
    case "unexpected":
      return failure.message;
    case "validation":
      return failure.message;
    default:
      return "Something went wrong. Please try again.";
  }
}

export function AuthForm({ mode, onSubmit, onSuccess }: AuthFormProps) {
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormMessage(null);

    const errors =
      mode === "register"
        ? validateRegistration(email, password)
        : validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    const result = await onSubmit(email.trim(), password);
    setSubmitting(false);

    if (result.ok) {
      onSuccess(result.data);
      return;
    }
    if (result.error.kind === "validation") {
      setFieldErrors(result.error.fields);
    }
    setFormMessage(formError(result.error));
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h1 className="text-xl font-semibold">{copy.title}</h1>

      {formMessage ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {formMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-xs text-red-600">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : "password-hint"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950"
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-xs text-red-600">
            {fieldErrors.password}
          </p>
        ) : mode === "register" ? (
          <p id="password-hint" className="text-xs text-slate-400">
            At least {PASSWORD_MIN_LENGTH} characters. Passphrases welcome.
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {submitting ? "Please wait…" : copy.submit}
      </button>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        {copy.alt}{" "}
        <Link href={copy.altHref} className="font-medium underline">
          {copy.altLabel}
        </Link>
      </p>
    </form>
  );
}
