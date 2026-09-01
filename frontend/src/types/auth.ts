/** Safe public projection of a user, as returned by the backend. */
export interface User {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

/** The network response is untrusted input - validate its shape. */
export function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.is_active === "boolean" &&
    typeof v.created_at === "string"
  );
}

/** Discriminated failure reasons the UI renders differently. */
export type AuthFailure =
  | { kind: "invalid_credentials"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "validation"; message: string; fields: { email?: string; password?: string } }
  | { kind: "rate_limited"; message: string }
  | { kind: "unauthenticated" }
  | { kind: "unreachable"; message: string }
  | { kind: "unexpected"; message: string };

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthFailure };

/** Logout outcome. State is only cleared when `ok` is true. */
export type LogoutResult = { ok: true } | { ok: false; error: AuthFailure };
