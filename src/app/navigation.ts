import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Repeat2,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import { useMessages } from "@/lib/i18n/I18nContext";
import type { Messages } from "@/lib/i18n/I18nContext";

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

type NavLabelKey = keyof Messages["nav"];

interface NavDefinition {
  to: string;
  labelKey: Exclude<NavLabelKey, "primary" | "secondary" | "phaseNote">;
  icon: LucideIcon;
  end?: boolean;
}

const PRIMARY_DEFINITIONS: NavDefinition[] = [
  { to: "/", labelKey: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/goals", labelKey: "goals", icon: Target },
  { to: "/tasks", labelKey: "tasks", icon: ListChecks },
  { to: "/planner", labelKey: "planner", icon: CalendarDays },
  { to: "/habits", labelKey: "habits", icon: Repeat2 },
  { to: "/analytics", labelKey: "analytics", icon: BarChart3 },
  { to: "/assistant", labelKey: "assistant", icon: Sparkles },
];

const SECONDARY_DEFINITIONS: NavDefinition[] = [
  { to: "/settings", labelKey: "settings", icon: Settings },
];

function translate(defs: NavDefinition[], nav: Messages["nav"]): NavEntry[] {
  return defs.map((def) => ({ to: def.to, label: nav[def.labelKey], icon: def.icon, end: def.end }));
}

/**
 * Translated navigation. Labels come from the `nav` dictionary via stable
 * keys — never hardcoded English — so switching language re-renders the
 * sidebar/mobile nav instantly.
 */
export function usePrimaryNav(): NavEntry[] {
  const m = useMessages();
  return translate(PRIMARY_DEFINITIONS, m.nav);
}

export function useSecondaryNav(): NavEntry[] {
  const m = useMessages();
  return translate(SECONDARY_DEFINITIONS, m.nav);
}

/** Legacy static entries (English) for tests/back-compat; UI uses the hooks. */
export const PRIMARY_NAV: NavEntry[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/habits", label: "Habits", icon: Repeat2 },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles },
];

export const SECONDARY_NAV: NavEntry[] = [{ to: "/settings", label: "Settings", icon: Settings }];
