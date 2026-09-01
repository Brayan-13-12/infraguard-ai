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
   * Product / module name - always English, never translated (these are proper
   * nouns for the platform's areas, consistent across locales).
   */
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: NavStatus;
}

/**
 * Primary navigation. Only Dashboard is a real route today; the rest are shown
 * as disabled "Coming soon" items so the shell reads as intentional without
 * faking functionality.
 */
export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutIcon, status: "active" },
  { label: "Assets", href: "/assets", icon: BoxIcon, status: "soon" },
  { label: "Incidents", href: "/incidents", icon: ShieldIcon, status: "soon" },
  { label: "AI Assistant", href: "/ai", icon: SparklesIcon, status: "soon" },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: SettingsIcon, status: "soon" },
];
