import { NavLink } from "react-router-dom";

import { usePrimaryNav } from "@/app/navigation";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

export function MobileNav() {
  const m = useMessages();
  const primary = usePrimaryNav();

  return (
    <nav
      aria-label={m.nav.primary}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex gap-0 px-2 py-1.5">
        {primary.map((entry) => {
          const Icon = entry.icon;
          const label =
            entry.to === "/assistant"
              ? m.nav.assistantShort
              : entry.to === "/analytics"
                ? m.nav.analyticsShort
                : entry.to === "/planner"
                  ? m.nav.plannerShort
                  : entry.to === "/habits"
                    ? m.nav.habitsShort
                    : entry.to === "/"
                      ? m.nav.dashboardShort
                      : entry.label;

          return (
            <li key={entry.to} className="min-w-0 flex-1">
              <NavLink
                to={entry.to}
                end={entry.end}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-0 py-1.5 text-[11px] leading-none tracking-[-0.05em] transition-[color,background-color] duration-fast ease-standard",
                    isActive ? "bg-surface font-medium text-content" : "text-muted",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn("size-4 shrink-0", isActive ? "text-content" : "text-muted")}
                      aria-hidden="true"
                    />
                    <span className="w-full truncate text-center">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
