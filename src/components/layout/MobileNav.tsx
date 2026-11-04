import { NavLink } from "react-router-dom";

import { usePrimaryNav, useSecondaryNav } from "@/app/navigation";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

export function MobileNav() {
  const m = useMessages();
  const mobileNav = [...usePrimaryNav(), ...useSecondaryNav()];

  return (
    <nav
      aria-label={m.nav.primary}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex gap-0.5 overflow-x-auto px-1.5 py-1.5">
        {mobileNav.map((entry) => {
          const Icon = entry.icon;

          return (
            <li key={entry.to} className="flex-1">
              <NavLink
                to={entry.to}
                end={entry.end}
                className={({ isActive }) =>
                  cn(
                    "relative flex min-h-11 min-w-14 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-micro transition-[color,background-color] duration-fast ease-standard",
                    isActive ? "bg-canvas font-semibold text-content" : "text-muted",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-0.5 h-1 w-6 rounded-full bg-accent"
                      />
                    ) : null}
                    <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{entry.label}</span>
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
