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

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

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