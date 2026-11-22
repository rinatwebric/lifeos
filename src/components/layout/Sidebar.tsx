import { Search } from "lucide-react";
import { NavLink } from "react-router-dom";

import { usePrimaryNav, useSecondaryNav, type NavEntry } from "@/app/navigation";
import { Brand } from "@/components/layout/Brand";
import { DisplayControls } from "@/components/layout/DisplayControls";
import { cn } from "@/lib/cn";
import { commandKeyLabel, isApplePlatform } from "@/lib/platform";
import { useMessages } from "@/lib/i18n/I18nContext";

function SidebarLink({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;

  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      className={({ isActive }) =>
        cn(
          "flex min-h-9 items-center gap-2.5 rounded-full px-3 text-ui transition-[color,background-color] duration-fast ease-standard",
          isActive
            ? "bg-surface font-medium text-content"
            : "text-muted hover:bg-surface/60 hover:text-content",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn("size-4 shrink-0", isActive ? "text-content" : "text-muted")}
            aria-hidden="true"
          />
          <span className="truncate">{entry.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const m = useMessages();
  const primary = usePrimaryNav();
  const secondary = useSecondaryNav();
  const searchShortcut = commandKeyLabel(isApplePlatform());

  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-canvas px-4 py-5 lg:flex">
      <Brand showTagline />

      {onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          aria-keyshortcuts="Control+K Meta+K"
          className="mt-5 flex min-h-9 w-full items-center gap-2.5 rounded-full px-3 text-left text-ui text-muted transition-[color,background-color] duration-fast ease-standard hover:bg-surface/60 hover:text-content"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{m.commandPalette.open}</span>
          <kbd className="rounded-[5px] border border-line px-1.5 py-0.5 font-sans text-[10px] text-muted">
            {searchShortcut}
          </kbd>
        </button>
      ) : null}

      <nav aria-label={m.nav.primary} className="mt-4 flex flex-1 flex-col gap-0.5">
        {primary.map((entry) => (
          <SidebarLink key={entry.to} entry={entry} />
        ))}
      </nav>

      <nav aria-label={m.nav.secondary} className="mt-6 border-t border-line pt-3">
        <DisplayControls variant="compact" />
        {secondary.map((entry) => (
          <SidebarLink key={entry.to} entry={entry} />
        ))}
      </nav>
    </aside>
  );
}
