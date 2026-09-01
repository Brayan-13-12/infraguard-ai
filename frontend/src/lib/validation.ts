import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/config";

// Deliberately permissive - enough to catch obvious typos, not a second parser.
// The backend (pydantic EmailStr) is the authority.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validation outcomes are returned as stable codes (not prose) so the UI layer
 * owns the wording and can translate it. `passwordTooShort` / `passwordTooLong`
 * are parameterised by the policy bounds.
 */
export type ValidationCode =
  | "emailRequired"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordTooLong";

export function validateEmail(value: string): ValidationCode | null {
  const email = value.trim();
  if (!email) return "emailRequired";
  if (!EMAIL_RE.test(email)) return "emailInvalid";
  return null;
}

export function validatePassword(value: string): ValidationCode | null {
  if (!value) return "passwordRequired";
  if (value.length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if (value.length > PASSWORD_MAX_LENGTH) return "passwordTooLong";
  return null;
}

export interface CredentialErrors {
  email?: ValidationCode;
  password?: ValidationCode;
}

export function validateRegistration(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  const e = validateEmail(email);
  const p = validatePassword(password);
  if (e) errors.email = e;
  if (p) errors.password = p;
  return errors;
}

/** Login only checks presence - the server decides if the pair is valid. */
export function validateLogin(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  const e = validateEmail(email);
  if (e) errors.email = e;
  if (!password) errors.password = "passwordRequired";
  return errors;
}
