import { NavLink } from "react-router-dom";

import { usePrimaryNav, useSecondaryNav, type NavEntry } from "@/app/navigation";
import { Brand } from "@/components/layout/Brand";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

function SidebarLink({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;

  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      className={({ isActive }) =>
        cn(
          "relative flex min-h-11 items-center gap-2.5 rounded-control px-3 py-2 text-ui transition-[color,background-color] duration-fast ease-standard",
          isActive ? "bg-surface-muted font-semibold text-content" : "text-muted hover:bg-surface-muted hover:text-content",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-accent"
            />
          ) : null}
          <Icon className="size-4.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{entry.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const m = useMessages();
  const primary = usePrimaryNav();
  const secondary = useSecondaryNav();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
      <Brand showTagline />

      <nav aria-label={m.nav.primary} className="mt-6 flex flex-1 flex-col gap-0.5">
        {primary.map((entry) => (
          <SidebarLink key={entry.to} entry={entry} />
        ))}
      </nav>

      <nav aria-label={m.nav.secondary} className="border-t border-line pt-3">
        {secondary.map((entry) => (
          <SidebarLink key={entry.to} entry={entry} />
        ))}
      </nav>
    </aside>
  );
}
