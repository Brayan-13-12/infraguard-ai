"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useTranslation, type TranslationKey } from "@/i18n";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Permission,
} from "@/lib/permissions";
import * as authService from "@/services/auth";
import type {
  AuthFailure,
  AuthResult,
  LogoutResult,
  RegisterOutcome,
  User,
} from "@/types/auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Non-null when the last check failed for a reason other than "not logged in". */
  error: string | null;
  /** The caller's effective permissions (empty until authenticated). */
  permissions: string[];
  /** Mirror-only capability checks - the backend is the security boundary. */
  can: (code: Permission | string) => boolean;
  canAny: (codes: readonly (Permission | string)[]) => boolean;
  canAll: (codes: readonly (Permission | string)[]) => boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult<User>>;
  register: (email: string, password: string) => Promise<AuthResult<RegisterOutcome>>;
  /** Resolves { ok: false } and KEEPS the session when logout fails. */
  logout: () => Promise<LogoutResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Exposed for tests only - lets a test render a synchronous auth context. */
export const AuthContextInternal = AuthContext;
export type { AuthContextValue };

const FAILURE_MESSAGE_KEYS: Partial<Record<AuthFailure["kind"], TranslationKey>> = {
  unreachable: "auth.formErrors.unreachable",
  unexpected: "auth.formErrors.unexpected",
  invalid_credentials: "auth.formErrors.invalidCredentials",
  rate_limited: "auth.formErrors.rateLimited",
  account_pending: "auth.formErrors.accountPending",
  account_rejected: "auth.formErrors.accountRejected",
  account_disabled: "auth.formErrors.accountDisabled",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // The failure *kind* is stored, not prose, so the surfaced message follows the
  // active language. "unauthenticated" (simply not signed in) surfaces nothing.
  const [errorKind, setErrorKind] = useState<AuthFailure["kind"] | null>(null);

  const refresh = useCallback(async () => {
    const result = await authService.fetchMe();
    if (result.ok) {
      setUser(result.data);
      setStatus("authenticated");
      setErrorKind(null);
    } else {
      // A disabled account: drop the session and send the user to /login with a
      // clear message (the backend already rejects every protected request).
      setUser(null);
      setStatus("unauthenticated");
      setErrorKind(result.error.kind);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authService.login({ email, password });
      if (result.ok) {
        // The login payload carries identity only; re-hydrate the full session
        // (roles + effective permissions) from /auth/me before we render as
        // authenticated.
        await refresh();
      }
      return result;
    },
    [refresh],
  );

  const register = useCallback(
    (email: string, password: string) => authService.register({ email, password }),
    [],
  );

  const logout = useCallback(async (): Promise<LogoutResult> => {
    const result = await authService.logout();
    if (result.ok) {
      // Only NOW is the cookie confirmed cleared server-side.
      setUser(null);
      setStatus("unauthenticated");
      setErrorKind(null);
    } else {
      // The session cookie may still be valid - stay authenticated and surface it.
      setErrorKind(result.error.kind);
    }
    return result;
  }, []);

  const error = useMemo(() => {
    if (!errorKind) return null;
    const key = FAILURE_MESSAGE_KEYS[errorKind];
    return key ? t(key) : null;
  }, [errorKind, t]);

  const permissions = useMemo(() => user?.permissions ?? [], [user]);

  const can = useCallback(
    (code: Permission | string) => hasPermission(permissions, code),
    [permissions],
  );
  const canAny = useCallback(
    (codes: readonly (Permission | string)[]) => hasAnyPermission(permissions, codes),
    [permissions],
  );
  const canAll = useCallback(
    (codes: readonly (Permission | string)[]) => hasAllPermissions(permissions, codes),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      error,
      permissions,
      can,
      canAny,
      canAll,
      refresh,
      login,
      register,
      logout,
    }),
    [user, status, error, permissions, can, canAny, canAll, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Convenience hook for a single capability check. */
export function usePermission(code: Permission | string): boolean {
  return useAuth().can(code);
}

/** Convenience hook: true if the caller holds **any** of `codes`. */
export function usePermissions(codes: readonly (Permission | string)[]): boolean {
  return useAuth().canAny(codes);
}
