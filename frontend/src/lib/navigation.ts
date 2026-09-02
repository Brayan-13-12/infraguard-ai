import type { ComponentType, SVGProps } from "react";

import {
  BoxIcon,
  LayoutIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/ui/icons";

export type NavStatus = "active" | "soon";

export interface NavItem {
  /**
   * Product / module name - always English, never translated (proper nouns for
   * the platform's areas, consistent across locales).
   */
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: NavStatus;
}

/**
 * A single, flat navigation list - no visible section headings. Dashboard and
 * Assets are real routes; Incidents, AI Assistant and Settings are shown as
 * `aria-disabled` (not navigable) with a quiet lock marker + "Próximamente"
 * tooltip.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutIcon, status: "active" },
  { label: "Assets", href: "/assets", icon: BoxIcon, status: "active" },
  { label: "Incidents", href: "/incidents", icon: ShieldIcon, status: "soon" },
  { label: "AI Assistant", href: "/ai", icon: SparklesIcon, status: "soon" },
  { label: "Settings", href: "/settings", icon: SettingsIcon, status: "soon" },
];
