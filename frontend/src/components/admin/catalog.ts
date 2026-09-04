import type { TranslationKey } from "@/i18n";
import type { Permission } from "@/lib/permissions";

/** i18n keys for the friendly (Spanish) label of each permission code. Nested
 *  under group/action so the dotted code never has to be a translation key. */
const PERMISSION_LABEL_KEYS: Record<Permission, TranslationKey> = {
  "assets.read": "admin.permissionLabels.assets.read",
  "assets.create": "admin.permissionLabels.assets.create",
  "assets.update": "admin.permissionLabels.assets.update",
  "assets.delete": "admin.permissionLabels.assets.delete",
  "incidents.read": "admin.permissionLabels.incidents.read",
  "incidents.create": "admin.permissionLabels.incidents.create",
  "incidents.update": "admin.permissionLabels.incidents.update",
  "incidents.resolve": "admin.permissionLabels.incidents.resolve",
  "incidents.delete": "admin.permissionLabels.incidents.delete",
  "audit.read": "admin.permissionLabels.audit.read",
  "trash.read": "admin.permissionLabels.trash.read",
  "trash.restore": "admin.permissionLabels.trash.restore",
  "users.read": "admin.permissionLabels.users.read",
  "users.manage": "admin.permissionLabels.users.manage",
  "roles.read": "admin.permissionLabels.roles.read",
  "roles.manage": "admin.permissionLabels.roles.manage",
  "ai.use": "admin.permissionLabels.ai.use",
};

const GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  assets: "admin.permissionGroups.assets",
  incidents: "admin.permissionGroups.incidents",
  audit: "admin.permissionGroups.audit",
  trash: "admin.permissionGroups.trash",
  users: "admin.permissionGroups.users",
  roles: "admin.permissionGroups.roles",
  ai: "admin.permissionGroups.ai",
};

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Friendly label for a permission code, falling back to the code itself. */
export function permissionLabel(t: T, code: string): string {
  const key = PERMISSION_LABEL_KEYS[code as Permission];
  return key ? t(key) : code;
}

export function permissionGroupLabel(t: T, group: string): string {
  const key = GROUP_LABEL_KEYS[group];
  return key ? t(key) : group;
}
