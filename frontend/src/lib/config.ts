/**
 * Client-side configuration.
 *
 * Only NEXT_PUBLIC_* values may appear here - they are embedded in the browser
 * bundle and must never contain secrets.
 */

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Backend API base URL with any trailing slash removed. */
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, "");

/** Readiness probe - reflects backend + PostgreSQL health (200 or 503). */
export const READINESS_ENDPOINT = `${API_BASE_URL}/api/v1/health/ready`;
