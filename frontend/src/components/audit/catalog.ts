/**
 * Display helpers for the audit vocabularies.
 *
 * Stored values are English and match the backend `StrEnum`s; these maps only
 * translate them for display. The backend may also store reserved values that
 * are never emitted in Phase 1 - `*Label` falls back to the raw string so an
 * unknown value still renders readably.
 */

import type { ComponentType, SVGProps } from "react";

import type { SelectOption } from "@/components/ui/Select";
import {
  ArrowsSwapIcon,
  CheckIcon,
  HistoryIcon,
  LinkIcon,
  LogInIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  RestoreIcon,
  TrashIcon,
} from "@/components/ui/icons";
import type { TranslationKey } from "@/i18n";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditChange,
  type AuditEntityType,
} from "@/types/audit";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;
type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The complete visual definition for one audit action - the **single source of
 * truth** consumed by the timeline node, the segmented rail and the card's left
 * accent. Never build these class strings ad-hoc in a component.
 *
 * `node` / `rail` / `accent` are full literal Tailwind class strings (so the
 * JIT keeps them). Colour is confined to the small node, the ~1-2px rail
 * segment and the thin accent bar - the card surface stays neutral, and the
 * icon + translated title always carry the meaning.
 */
export interface AuditActionVisual {
  icon: IconCmp;
  /** circular timeline node: faint tinted fill + solid icon/text + ring */
  node: string;
  /** the connector segment directly below this event's node */
  rail: string;
  /** the thin left accent bar on the event card (`before:` utilities) */
  accent: string;
}

const V = (icon: IconCmp, node: string, rail: string, accent: string): AuditActionVisual => ({
  icon,
  node,
  rail,
  accent,
});

/**
 * Action -> visual identity. One hue per activity family so the feed is
 * scannable at a glance (CREATE emerald · UPDATE blue · STATUS_CHANGED amber ·
 * RESOLVED teal-green · REOPENED orange · RELATION_CHANGED indigo · LOGIN cyan ·
 * LOGOUT slate · DELETE red · RESTORE violet). The reserved RBAC actions are
 * assigned deliberately rather than defaulting to blue.
 */
export const AUDIT_ACTION_VISUAL: Record<AuditAction, AuditActionVisual> = {
  CREATE: V(
    PlusIcon,
    "bg-audit-create/10 text-audit-create ring-audit-create/35 group-hover/row:ring-audit-create/60",
    "bg-audit-create/45",
    "before:bg-audit-create/80 group-hover/ev:before:bg-audit-create",
  ),
  UPDATE: V(
    PencilIcon,
    "bg-audit-update/10 text-audit-update ring-audit-update/35 group-hover/row:ring-audit-update/60",
    "bg-audit-update/45",
    "before:bg-audit-update/80 group-hover/ev:before:bg-audit-update",
  ),
  STATUS_CHANGED: V(
    ArrowsSwapIcon,
    "bg-audit-status/15 text-audit-status ring-audit-status/40 group-hover/row:ring-audit-status/65",
    "bg-audit-status/50",
    "before:bg-audit-status/85 group-hover/ev:before:bg-audit-status",
  ),
  RELATION_CHANGED: V(
    LinkIcon,
    "bg-audit-relation/10 text-audit-relation ring-audit-relation/35 group-hover/row:ring-audit-relation/60",
    "bg-audit-relation/45",
    "before:bg-audit-relation/80 group-hover/ev:before:bg-audit-relation",
  ),
  RESOLVED: V(
    CheckIcon,
    "bg-audit-resolved/10 text-audit-resolved ring-audit-resolved/35 group-hover/row:ring-audit-resolved/60",
    "bg-audit-resolved/45",
    "before:bg-audit-resolved/80 group-hover/ev:before:bg-audit-resolved",
  ),
  REOPENED: V(
    RefreshIcon,
    "bg-audit-reopened/15 text-audit-reopened ring-audit-reopened/40 group-hover/row:ring-audit-reopened/65",
    "bg-audit-reopened/50",
    "before:bg-audit-reopened/85 group-hover/ev:before:bg-audit-reopened",
  ),
  LOGIN: V(
    LogInIcon,
    "bg-audit-login/10 text-audit-login ring-audit-login/35 group-hover/row:ring-audit-login/60",
    "bg-audit-login/45",
    "before:bg-audit-login/80 group-hover/ev:before:bg-audit-login",
  ),
  LOGOUT: V(
    LogOutIcon,
    "bg-audit-logout/15 text-audit-logout ring-audit-logout/35 group-hover/row:ring-audit-logout/55",
    "bg-audit-logout/40",
    "before:bg-audit-logout/70 group-hover/ev:before:bg-audit-logout",
  ),
  DELETE: V(
    TrashIcon,
    "bg-audit-delete/10 text-audit-delete ring-audit-delete/40 group-hover/row:ring-audit-delete/65",
    "bg-audit-delete/50",
    "before:bg-audit-delete/85 group-hover/ev:before:bg-audit-delete",
  ),
  RESTORE: V(
    RestoreIcon,
    "bg-audit-restore/10 text-audit-restore ring-audit-restore/35 group-hover/row:ring-audit-restore/60",
    "bg-audit-restore/45",
    "before:bg-audit-restore/80 group-hover/ev:before:bg-audit-restore",
  ),
  ROLE_ASSIGNED: V(
    PlusIcon,
    "bg-audit-relation/10 text-audit-relation ring-audit-relation/35 group-hover/row:ring-audit-relation/60",
    "bg-audit-relation/45",
    "before:bg-audit-relation/80 group-hover/ev:before:bg-audit-relation",
  ),
  ROLE_REMOVED: V(
    HistoryIcon,
    "bg-audit-logout/15 text-audit-logout ring-audit-logout/35 group-hover/row:ring-audit-logout/55",
    "bg-audit-logout/40",
    "before:bg-audit-logout/70 group-hover/ev:before:bg-audit-logout",
  ),
  PERMISSION_CHANGED: V(
    PencilIcon,
    "bg-audit-status/15 text-audit-status ring-audit-status/40 group-hover/row:ring-audit-status/65",
    "bg-audit-status/50",
    "before:bg-audit-status/85 group-hover/ev:before:bg-audit-status",
  ),
};

/** Fallback for an action the frontend does not know (never emitted today). */
export const NEUTRAL_ACTION_VISUAL: AuditActionVisual = V(
  HistoryIcon,
  "bg-muted text-muted-foreground ring-border group-hover/row:ring-muted-foreground/40",
  "bg-border",
  "before:bg-border group-hover/ev:before:bg-muted-foreground/60",
);

export const AUDIT_ACTION_KEYS: Record<AuditAction, TranslationKey> = {
  CREATE: "auditActions.CREATE",
  UPDATE: "auditActions.UPDATE",
  STATUS_CHANGED: "auditActions.STATUS_CHANGED",
  RELATION_CHANGED: "auditActions.RELATION_CHANGED",
  RESOLVED: "auditActions.RESOLVED",
  REOPENED: "auditActions.REOPENED",
  LOGIN: "auditActions.LOGIN",
  LOGOUT: "auditActions.LOGOUT",
  DELETE: "auditActions.DELETE",
  RESTORE: "auditActions.RESTORE",
  ROLE_ASSIGNED: "auditActions.ROLE_ASSIGNED",
  ROLE_REMOVED: "auditActions.ROLE_REMOVED",
  PERMISSION_CHANGED: "auditActions.PERMISSION_CHANGED",
};

export const AUDIT_ENTITY_KEYS: Record<AuditEntityType, TranslationKey> = {
  Asset: "auditEntities.Asset",
  Incident: "auditEntities.Incident",
  Authentication: "auditEntities.Authentication",
  User: "auditEntities.User",
  Role: "auditEntities.Role",
  Permission: "auditEntities.Permission",
};

function isAction(v: string): v is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(v);
}

function isEntity(v: string): v is AuditEntityType {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(v);
}

export const auditActionLabel = (t: T, action: string): string =>
  isAction(action) ? t(AUDIT_ACTION_KEYS[action]) : action;

/** The centralized visual identity (icon + node + rail + accent) for an action. */
export const auditActionVisual = (action: string): AuditActionVisual =>
  isAction(action) ? AUDIT_ACTION_VISUAL[action] : NEUTRAL_ACTION_VISUAL;

export const auditActionIcon = (action: string): IconCmp => auditActionVisual(action).icon;

export const auditEntityLabel = (t: T, entity: string): string =>
  isEntity(entity) ? t(AUDIT_ENTITY_KEYS[entity]) : entity;

/**
 * Entity- and action-aware headline for a timeline event / detail header, e.g.
 * "Activo actualizado", "Incidente resuelto", "Inicio de sesión". Both entity
 * types that carry lifecycle actions ("Activo", "Incidente") are masculine in
 * Spanish, so the participles agree; Authentication actions have dedicated
 * copy. Unknown actions fall back to the plain action label.
 */
export function auditEventTitle(
  t: T,
  action: string,
  entityType: string,
): string {
  if (action === "LOGIN") return t("auditActions.LOGIN");
  if (action === "LOGOUT") return t("auditActions.LOGOUT");
  if (action === "RELATION_CHANGED") {
    return entityType === "Incident"
      ? t("audit.eventTitle.relationIncident")
      : t("audit.eventTitle.relationGeneric");
  }
  if (!isAction(action)) return action;
  const entity = auditEntityLabel(t, entityType);
  const entityLower = entity.toLowerCase();
  switch (action) {
    case "CREATE":
      return t("audit.eventTitle.created", { entity });
    case "UPDATE":
      return t("audit.eventTitle.updated", { entity });
    case "STATUS_CHANGED":
      return t("audit.eventTitle.statusChanged", { entity: entityLower });
    case "RESOLVED":
      return t("audit.eventTitle.resolved", { entity });
    case "REOPENED":
      return t("audit.eventTitle.reopened", { entity });
    case "DELETE":
      return t("audit.eventTitle.deleted", { entity });
    case "RESTORE":
      return t("audit.eventTitle.restored", { entity });
    default:
      return auditActionLabel(t, action);
  }
}

export const auditActionOptions = (t: T, actions: readonly AuditAction[]): SelectOption[] =>
  actions.map((a) => ({ value: a, label: t(AUDIT_ACTION_KEYS[a]) }));

export const auditEntityOptions = (
  t: T,
  entities: readonly AuditEntityType[],
): SelectOption[] => entities.map((e) => ({ value: e, label: t(AUDIT_ENTITY_KEYS[e]) }));

/**
 * Split a `RELATION_CHANGED` "affected_assets" change (comma-joined label
 * lists) into added / removed sets. The backend also records this in scrubbed
 * `metadata`, but only the detail endpoint returns metadata - the change row's
 * old/new values carry the same labels and are on the list projection.
 */
export function relationDelta(change: AuditChange | undefined): {
  added: string[];
  removed: string[];
} {
  const split = (v: string | null) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const before = new Set(split(change?.old_value ?? null));
  const after = split(change?.new_value ?? null);
  const afterSet = new Set(after);
  return {
    added: after.filter((x) => !before.has(x)),
    removed: [...before].filter((x) => !afterSet.has(x)),
  };
}
