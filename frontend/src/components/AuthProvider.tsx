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
import * as authService from "@/services/auth";
import type { AuthFailure, AuthResult, LogoutResult, User } from "@/types/auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Non-null when the last check failed for a reason other than "not logged in". */
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult<User>>;
  register: (email: string, password: string) => Promise<AuthResult<User>>;
  /** Resolves { ok: false } and KEEPS the session when logout fails. */
  logout: () => Promise<LogoutResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FAILURE_MESSAGE_KEYS: Partial<Record<AuthFailure["kind"], TranslationKey>> = {
  unreachable: "auth.formErrors.unreachable",
  unexpected: "auth.formErrors.unexpected",
  invalid_credentials: "auth.formErrors.invalidCredentials",
  rate_limited: "auth.formErrors.rateLimited",
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
      setUser(null);
      setStatus("unauthenticated");
      setErrorKind(result.error.kind);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login({ email, password });
    if (result.ok) {
      setUser(result.data);
      setStatus("authenticated");
      setErrorKind(null);
    }
    return result;
  }, []);

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

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, error, refresh, login, register, logout }),
    [user, status, error, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
