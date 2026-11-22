import { Menu } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { usePrimaryNav, useSecondaryNav, type NavEntry } from "@/app/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { useMessages, type Messages } from "@/lib/i18n/I18nContext";

const MOBILE_PATHS = ["/", "/tasks", "/planner", "/assistant"] as const;

function isEntryActive(pathname: string, entry: NavEntry): boolean {
  return entry.to === "/"
    ? pathname === "/"
    : pathname === entry.to || pathname.startsWith(`${entry.to}/`);
}

function mobileLabel(entry: NavEntry, m: Messages): string {
  if (entry.to === "/") return m.nav.dashboardShort;
  if (entry.to === "/planner") return m.nav.plannerShort;
  if (entry.to === "/assistant") return m.nav.assistantShort;
  return entry.label;
}

export function MobileNav() {
  const m = useMessages();
  const location = useLocation();
  const primary = usePrimaryNav();
  const secondary = useSecondaryNav();
  const [moreOpen, setMoreOpen] = useState(false);

  const mobileEntries = primary.filter((entry) =>
    MOBILE_PATHS.includes(entry.to as (typeof MOBILE_PATHS)[number]),
  );
  const moreEntries = [
    ...primary.filter((entry) => !MOBILE_PATHS.includes(entry.to as (typeof MOBILE_PATHS)[number])),
    ...secondary,
  ];
  const moreActive = moreEntries.some((entry) => isEntryActive(location.pathname, entry));

  return (
    <>
      <nav
        aria-label={m.nav.primary}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex gap-0 px-2 py-1.5">
          {mobileEntries.map((entry) => {
            const Icon = entry.icon;

            return (
              <li key={entry.to} className="min-w-0 flex-1">
                <NavLink
                  to={entry.to}
                  end={entry.end}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-0 py-1.5 text-[11px] leading-none tracking-[-0.02em] transition-[color,background-color] duration-fast ease-standard",
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
                      <span className="w-full truncate text-center">{mobileLabel(entry, m)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}

          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-label={m.nav.moreTitle}
              aria-current={moreActive ? "page" : undefined}
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-control px-0 py-1.5 text-[11px] leading-none tracking-[-0.02em] transition-[color,background-color] duration-fast ease-standard",
                moreActive ? "bg-surface font-medium text-content" : "text-muted",
              )}
            >
              <Menu
                className={cn("size-4 shrink-0", moreActive ? "text-content" : "text-muted")}
                aria-hidden="true"
              />
              <span className="w-full truncate text-center">{m.nav.more}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={m.nav.moreTitle}>
        <ul className="space-y-1">
          {moreEntries.map((entry) => {
            const Icon = entry.icon;

            return (
              <li key={entry.to}>
                <NavLink
                  to={entry.to}
                  end={entry.end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-12 items-center gap-3 rounded-control px-3 text-ui transition-colors duration-fast ease-standard",
                      isActive
                        ? "bg-surface-muted font-medium text-content"
                        : "text-muted hover:bg-surface-muted hover:text-content",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          "size-4.5 shrink-0",
                          isActive ? "text-content" : "text-muted",
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{entry.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
