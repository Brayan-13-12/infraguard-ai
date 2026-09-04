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

/** Assets / infrastructure inventory API. */
export const ASSETS_ENDPOINT = `${v1}/assets`;

/** Aggregate asset counts for the dashboard. */
export const ASSETS_SUMMARY_ENDPOINT = `${v1}/assets/summary`;

/** Asset list pagination defaults - mirror the backend (app/schemas/asset.py). */
export const ASSETS_PAGE_SIZE = 20;
export const ASSETS_MAX_PAGE_SIZE = 100;

/** Asset field length caps - mirror the backend model (app/models/asset.py). */
export const ASSET_LIMITS = {
  name: 200,
  hostname: 253,
  ipAddress: 45,
  owner: 200,
  description: 2000,
} as const;

/** Incidents / incident management API. */
export const INCIDENTS_ENDPOINT = `${v1}/incidents`;

/** Aggregate incident counts for the dashboard. */
export const INCIDENTS_SUMMARY_ENDPOINT = `${v1}/incidents/summary`;

/** Incident list pagination default - mirrors the backend (app/schemas/incident.py).
 *  Denser rows than assets, so 15 per page instead of 20. */
export const INCIDENTS_PAGE_SIZE = 15;

/** Incident field length caps - mirror the backend model (app/models/incident.py). */
export const INCIDENT_LIMITS = {
  title: 200,
  owner: 200,
  description: 5000,
  comment: 2000,
  maxAssetLinks: 200,
} as const;

/** Trash / Restore API (Governance & Administration - Phase 2). */
export const TRASH_ENDPOINT = `${v1}/trash`;

/** Trash pagination defaults - mirror the backend (app/schemas/trash.py). */
export const TRASH_ASSETS_PAGE_SIZE = 20;
export const TRASH_INCIDENTS_PAGE_SIZE = 15;
export const TRASH_MAX_PAGE_SIZE = 100;

/** AI Assistant API (read-only, grounded, permission-aware - AI milestone v1). */
export const AI_ENDPOINT = `${v1}/ai`;

/** AI conversation list page size (mirrors app/schemas/ai.py). */
export const AI_CONVERSATIONS_PAGE_SIZE = 30;

/** Fallback max message length; the real value comes from `/ai/capabilities`. */
export const AI_MESSAGE_MAX_LENGTH = 4000;

/** Audit log API (read-only, append-only - Governance & Administration Phase 1). */
export const AUDIT_ENDPOINT = `${v1}/audit`;

/** Compact "activity today" counters for the Audit page header. */
export const AUDIT_SUMMARY_ENDPOINT = `${v1}/audit/summary`;

/** Audit list pagination default - mirrors the backend (app/schemas/audit.py). */
export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_MAX_PAGE_SIZE = 100;

/** Password policy - mirrors the backend (app/core/config.py). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Asset relationships API (Asset Relationships & Topology milestone). */
export const RELATIONSHIPS_ENDPOINT = `${v1}/relationships`;
export const RELATIONSHIPS_PAGE_SIZE = 50;
export const RELATIONSHIPS_MAX_PAGE_SIZE = 100;
export const RELATIONSHIP_DESCRIPTION_MAX_LENGTH = 500;
/** The global Dependencias module's list page size - denser than the default. */
export const DEPENDENCIES_PAGE_SIZE = 20;

/** Bounded graph/topology query API. */
export const TOPOLOGY_ENDPOINT = `${v1}/topology`;
export const TOPOLOGY_DEFAULT_DEPTH = 1;
export const TOPOLOGY_MAX_DEPTH = 3;
export const TOPOLOGY_DEFAULT_NODE_CAP = 200;
export const TOPOLOGY_MAX_NODES = 500;
