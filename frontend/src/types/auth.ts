/** Minimal role identity carried on the current-user payload. */
export interface RoleRef {
  id: string;
  name: string;
  slug: string;
}

/**
 * Account lifecycle (Governance Phase 3). Public registration files a `pending`
 * access request; an administrator approves (-> `active`, roles assigned) or
 * rejects (-> `rejected`). `disabled` is a runtime enable/disable of an
 * already-provisioned account. Only `active` accounts can authenticate.
 */
export type AccountStatus = "pending" | "active" | "rejected" | "disabled";

/**
 * Safe public projection of a user **plus the caller's effective authorization
 * state**, as returned by `GET /auth/me`.
 *
 * `permissions` is the union of the permissions of every assigned role - the
 * exact set the backend enforces. The frontend uses it *only* to mirror what the
 * API already allows; it is never the security boundary (`register` / `login`
 * responses carry just the identity fields).
 */
export interface User {
  id: string;
  email: string;
  is_active: boolean;
  /** Present on `GET /auth/me`; absent on the lighter payloads. */
  account_status?: AccountStatus;
  created_at: string;
  roles: RoleRef[];
  permissions: string[];
}

/** `POST /auth/register` no longer returns a session - just the request state. */
export interface RegisterOutcome {
  account_status: AccountStatus;
  detail: string;
}

function isRoleRef(value: unknown): value is RoleRef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.slug === "string"
  );
}

/**
 * The network response is untrusted input - validate its shape. `roles` /
 * `permissions` are tolerated when absent (the lighter `register` / `login`
 * payloads) and normalised to `[]` by {@link normalizeUser}.
 */
export function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const base =
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.is_active === "boolean" &&
    typeof v.created_at === "string";
  if (!base) return false;
  if (v.account_status !== undefined && typeof v.account_status !== "string") return false;
  if (v.roles !== undefined && !(Array.isArray(v.roles) && v.roles.every(isRoleRef))) {
    return false;
  }
  if (
    v.permissions !== undefined &&
    !(Array.isArray(v.permissions) && v.permissions.every((p) => typeof p === "string"))
  ) {
    return false;
  }
  return true;
}

/** Fill in `roles` / `permissions` defaults for the identity-only payloads. */
export function normalizeUser(value: User): User {
  return {
    ...value,
    roles: Array.isArray(value.roles) ? value.roles : [],
    permissions: Array.isArray(value.permissions) ? value.permissions : [],
  };
}

/** Discriminated failure reasons the UI renders differently. */
export type AuthFailure =
  | { kind: "invalid_credentials"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "validation"; message: string; fields: { email?: string; password?: string } }
  | { kind: "rate_limited"; message: string }
  | { kind: "unauthenticated" }
  /** Credentials were valid, but the account cannot sign in yet / any more. */
  | { kind: "account_pending"; message: string }
  | { kind: "account_rejected"; message: string }
  | { kind: "account_disabled"; message: string }
  | { kind: "unreachable"; message: string }
  | { kind: "unexpected"; message: string };

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthFailure };

/** Logout outcome. State is only cleared when `ok` is true. */
export type LogoutResult = { ok: true } | { ok: false; error: AuthFailure };
