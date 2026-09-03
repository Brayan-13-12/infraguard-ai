import { AUTH_ENDPOINTS } from "@/lib/config";
import {
  AccountStatus,
  AuthFailure,
  AuthResult,
  isUser,
  LogoutResult,
  normalizeUser,
  RegisterOutcome,
  User,
} from "@/types/auth";

const REQUEST_TIMEOUT_MS = 8000;

interface Credentials {
  email: string;
  password: string;
}

const UNREACHABLE: AuthFailure = {
  kind: "unreachable",
  message: "Could not reach the server. Check your connection and try again.",
};

/** Parse a FastAPI 422 body into per-field messages. */
function parseFieldErrors(body: unknown): { email?: string; password?: string } {
  const fields: { email?: string; password?: string } = {};
  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { detail?: unknown }).detail)
  ) {
    for (const item of (body as { detail: unknown[] }).detail) {
      if (typeof item !== "object" || item === null) continue;
      const loc = (item as { loc?: unknown }).loc;
      const msg = (item as { msg?: unknown }).msg;
      if (!Array.isArray(loc) || typeof msg !== "string") continue;
      const field = loc[loc.length - 1];
      if (field === "email" && !fields.email) fields.email = msg;
      if (field === "password" && !fields.password) fields.password = msg;
    }
  }
  return fields;
}

async function request(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init.headers },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

/** A 403 from `login` / `me` carries `{ detail: { code, message } }`. */
function accountStateFailure(body: unknown): AuthFailure {
  const detail =
    typeof body === "object" && body !== null
      ? (body as { detail?: unknown }).detail
      : null;
  const code =
    typeof detail === "object" && detail !== null
      ? (detail as { code?: unknown }).code
      : undefined;
  const message =
    typeof detail === "object" && detail !== null && typeof (detail as { message?: unknown }).message === "string"
      ? ((detail as { message: string }).message)
      : "Your account cannot sign in. Contact an administrator.";
  if (code === "account_pending") return { kind: "account_pending", message };
  if (code === "account_rejected") return { kind: "account_rejected", message };
  return { kind: "account_disabled", message };
}

export async function register({
  email,
  password,
}: Credentials): Promise<AuthResult<RegisterOutcome>> {
  const res = await request(AUTH_ENDPOINTS.register, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (res === null) return { ok: false, error: UNREACHABLE };

  if (res.status === 201) {
    // An access request was filed - NOT a session. The account is `pending`
    // until an administrator approves it.
    const body = (res.body ?? {}) as { account_status?: unknown; detail?: unknown };
    const status: AccountStatus =
      typeof body.account_status === "string"
        ? (body.account_status as AccountStatus)
        : "pending";
    return {
      ok: true,
      data: {
        account_status: status,
        detail: typeof body.detail === "string" ? body.detail : "",
      },
    };
  }
  if (res.status === 409) {
    return { ok: false, error: { kind: "conflict", message: "That email is already registered." } };
  }
  if (res.status === 422) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "Please fix the highlighted fields.",
        fields: parseFieldErrors(res.body),
      },
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: { kind: "rate_limited", message: detailOf(res.body, "Too many attempts. Try again shortly.") },
    };
  }
  return { ok: false, error: { kind: "unexpected", message: "Registration failed. Please try again." } };
}

export async function login({ email, password }: Credentials): Promise<AuthResult<User>> {
  const res = await request(AUTH_ENDPOINTS.login, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (res === null) return { ok: false, error: UNREACHABLE };

  if (res.status === 200 && isUser(res.body)) {
    return { ok: true, data: normalizeUser(res.body) };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { kind: "invalid_credentials", message: "Invalid email or password." },
    };
  }
  if (res.status === 403) {
    // Credentials were valid; the account is pending / rejected / disabled.
    return { ok: false, error: accountStateFailure(res.body) };
  }
  if (res.status === 422) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "Please fix the highlighted fields.",
        fields: parseFieldErrors(res.body),
      },
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: { kind: "rate_limited", message: detailOf(res.body, "Too many attempts. Try again shortly.") },
    };
  }
  return { ok: false, error: { kind: "unexpected", message: "Sign in failed. Please try again." } };
}

export async function logout(): Promise<LogoutResult> {
  // The caller must ONLY drop authenticated state when this returns { ok: true }.
  // On a network/server failure the HttpOnly cookie may still be valid, so the
  // session must be treated as live.
  const res = await request(AUTH_ENDPOINTS.logout, { method: "POST" });
  if (res === null) return { ok: false, error: UNREACHABLE };
  if (res.status === 200) return { ok: true };
  if (res.status === 429) {
    return {
      ok: false,
      error: { kind: "rate_limited", message: detailOf(res.body, "Too many attempts. Try again shortly.") },
    };
  }
  return {
    ok: false,
    error: { kind: "unexpected", message: "Sign out failed. You are still signed in - please try again." },
  };
}

export async function fetchMe(): Promise<AuthResult<User>> {
  const res = await request(AUTH_ENDPOINTS.me, { method: "GET" });
  if (res === null) return { ok: false, error: UNREACHABLE };

  if (res.status === 200 && isUser(res.body)) {
    return { ok: true, data: normalizeUser(res.body) };
  }
  if (res.status === 401) return { ok: false, error: { kind: "unauthenticated" } };
  if (res.status === 403) return { ok: false, error: accountStateFailure(res.body) };
  return { ok: false, error: { kind: "unexpected", message: "Could not load your profile." } };
}
