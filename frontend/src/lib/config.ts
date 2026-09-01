/**
 * Client-side configuration.
 *
 * Only NEXT_PUBLIC_* values may appear here - they are embedded in the browser
 * bundle and must never contain secrets. The access token is delivered as an
 * HttpOnly cookie by the backend and is never visible to this code.
 */

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Backend API base URL with any trailing slash removed. */
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, "");

const v1 = `${API_BASE_URL}/api/v1`;

/** Readiness probe - reflects backend + PostgreSQL health (200 or 503). */
export const READINESS_ENDPOINT = `${v1}/health/ready`;

export const AUTH_ENDPOINTS = {
  register: `${v1}/auth/register`,
  login: `${v1}/auth/login`,
  logout: `${v1}/auth/logout`,
  me: `${v1}/auth/me`,
} as const;

/** Password policy - mirrors the backend (app/core/config.py). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
