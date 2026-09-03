"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckIcon, EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { useTranslation, type TranslationKey } from "@/i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/config";
import {
  validateLogin,
  validateRegistration,
  type ValidationCode,
} from "@/lib/validation";
import type { AuthFailure, AuthResult } from "@/types/auth";

interface AuthFormProps<T> {
  mode: "login" | "register";
  onSubmit: (email: string, password: string) => Promise<AuthResult<T>>;
  onSuccess: (data: T) => void;
}

const FIELD_ERROR_KEYS: Record<ValidationCode, TranslationKey> = {
  emailRequired: "auth.fieldErrors.emailRequired",
  emailInvalid: "auth.fieldErrors.emailInvalid",
  passwordRequired: "auth.fieldErrors.passwordRequired",
  passwordTooShort: "auth.fieldErrors.passwordTooShort",
  passwordTooLong: "auth.fieldErrors.passwordTooLong",
};

const FORM_ERROR_KEYS: Record<AuthFailure["kind"], TranslationKey> = {
  invalid_credentials: "auth.formErrors.invalidCredentials",
  conflict: "auth.formErrors.conflict",
  rate_limited: "auth.formErrors.rateLimited",
  unreachable: "auth.formErrors.unreachable",
  validation: "auth.formErrors.validation",
  unauthenticated: "auth.formErrors.unexpected",
  account_pending: "auth.formErrors.accountPending",
  account_rejected: "auth.formErrors.accountRejected",
  account_disabled: "auth.formErrors.accountDisabled",
  unexpected: "auth.formErrors.unexpected",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function AuthForm<T>({ mode, onSubmit, onSuccess }: AuthFormProps<T>) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const copy =
    mode === "login"
      ? {
          title: t("auth.loginTitle"),
          subtitle: t("auth.loginSubtitle"),
          submit: t("auth.loginSubmit"),
          alt: t("auth.loginAlt"),
          altHref: "/register",
          altLabel: t("auth.loginAltLabel"),
        }
      : {
          title: t("auth.registerTitle"),
          subtitle: t("auth.registerSubtitle"),
          submit: t("auth.registerSubmit"),
          alt: t("auth.registerAlt"),
          altHref: "/login",
          altLabel: t("auth.registerAltLabel"),
        };

  function translateCode(code: ValidationCode | undefined): string | undefined {
    if (!code) return undefined;
    return t(FIELD_ERROR_KEYS[code], {
      min: PASSWORD_MIN_LENGTH,
      max: PASSWORD_MAX_LENGTH,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormMessage(null);

    const raw =
      mode === "register"
        ? validateRegistration(email, password)
        : validateLogin(email, password);
    const errors = {
      email: translateCode(raw.email),
      password: translateCode(raw.password),
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    const result = await onSubmit(email.trim(), password);

    if (result.ok) {
      // Brief, honest confirmation - the parent navigates immediately; this just
      // avoids a bare flash between submit and route change.
      setSucceeded(true);
      const finish = () => onSuccess(result.data);
      if (prefersReducedMotion()) finish();
      else window.setTimeout(finish, 260);
      return;
    }

    setSubmitting(false);
    if (result.error.kind === "validation") {
      setFieldErrors({
        email: result.error.fields.email,
        password: result.error.fields.password,
      });
    }
    setFormMessage(t(FORM_ERROR_KEYS[result.error.kind]));
  }

  const busy = submitting || succeeded;

  return (
    <div>
      <div className="mb-6 pr-10">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formMessage ? <Alert tone="danger">{formMessage}</Alert> : null}

        <Input
          label={t("auth.email")}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={busy}
        />

        <Input
          label={t("auth.password")}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={busy}
          hint={
            mode === "register"
              ? t("auth.passwordHint", { min: PASSWORD_MIN_LENGTH })
              : undefined
          }
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("a11y.hidePassword") : t("a11y.showPassword")}
              title={showPassword ? t("a11y.hidePassword") : t("a11y.showPassword")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        <Button
          type="submit"
          fullWidth
          loading={submitting}
          disabled={busy}
          className="mt-1"
        >
          {succeeded ? (
            <>
              <CheckIcon />
              {t("auth.redirecting")}
            </>
          ) : submitting ? (
            t("common.pleaseWait")
          ) : (
            copy.submit
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {copy.alt}{" "}
        <Link
          href={copy.altHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.altLabel}
        </Link>
      </p>
    </div>
  );
}
