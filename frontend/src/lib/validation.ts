import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/config";

// Deliberately permissive - enough to catch obvious typos, not a second parser.
// The backend (pydantic EmailStr) is the authority.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Email is required.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Password is required.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export interface CredentialErrors {
  email?: string;
  password?: string;
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
  if (!password) errors.password = "Password is required.";
  return errors;
}
