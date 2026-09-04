import type { ComponentType, SVGProps } from "react";

import {
  BoxIcon,
  HistoryIcon,
  LayoutIcon,
  LinkIcon,
  NetworkIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { ADMIN_PERMISSIONS, type Permission } from "@/lib/permissions";

export type NavStatus = "active" | "soon";

export interface NavItem {
  /**
   * Product / module name - always English, never translated (proper nouns for
   * the platform's areas, consistent across locales). Exception: `Dependencias`
   * is deliberately Spanish (matching the Asset-detail tab of the same name)
   * per an explicit product decision for this module.
   */
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: NavStatus;
  /**
   * Permission(s) that make this item visible. Omitted = visible to any
   * authenticated user. An array means "any of". **Visibility only** - the
   * backend still enforces access to every route.
   */
  permission?: Permission | Permission[];
}

/**
 * A single, flat navigation list - no visible section headings. Every item is
 * a real route except `Settings`, shown as `aria-disabled` (not navigable)
 * with a quiet lock marker + "Próximamente" tooltip.
 *
 * Items with a `permission` are filtered out by {@link visibleNavItems} for
 * users whose roles do not grant it.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutIcon, status: "active" },
  {
    label: "Assets",
    href: "/assets",
    icon: BoxIcon,
    status: "active",
    permission: "assets.read",
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: ShieldIcon,
    status: "active",
    permission: "incidents.read",
  },
  {
    label: "Dependencias",
    href: "/dependencies",
    icon: LinkIcon,
    status: "active",
    permission: "relationships.read",
  },
  {
    label: "Topology",
    href: "/topology",
    icon: NetworkIcon,
    status: "active",
    // The backend additionally requires assets.read (§49) - every system role
    // that grants relationships.read already grants assets.read alongside it,
    // so this stays a single-permission visibility hint like every other item.
    permission: "relationships.read",
  },
  {
    label: "Audit",
    href: "/audit",
    icon: HistoryIcon,
    status: "active",
    permission: "audit.read",
  },
  {
    label: "Trash",
    href: "/trash",
    icon: TrashIcon,
    status: "active",
    permission: "trash.read",
  },
  {
    label: "Administration",
    href: "/admin",
    icon: UsersIcon,
    status: "active",
    permission: [...ADMIN_PERMISSIONS] as Permission[],
  },
  {
    label: "AI Assistant",
    href: "/ai",
    icon: SparklesIcon,
    status: "active",
    permission: "ai.use",
  },
  { label: "Settings", href: "/settings", icon: SettingsIcon, status: "soon" },
];

/** Nav items the caller may see, given their effective permissions. */
export function visibleNavItems(
  can: (code: string) => boolean,
  items: NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter((item) => {
    if (!item.permission) return true;
    const codes = Array.isArray(item.permission) ? item.permission : [item.permission];
    return codes.some((c) => can(c));
  });
}
