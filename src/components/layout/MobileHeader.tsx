import { Search, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

export function MobileHeader({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const m = useMessages();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5 lg:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        {onOpenSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={m.commandPalette.open}
            className="relative grid size-9 place-items-center rounded-full text-muted transition-[color,background-color] duration-fast ease-standard after:absolute after:-inset-1 after:content-[''] hover:bg-surface hover:text-content"
          >
            <Search className="size-4.5" strokeWidth={2} absoluteStrokeWidth aria-hidden="true" />
          </button>
        ) : null}
        <NavLink
          to="/settings"
          aria-label={m.layout.mobileHeaderSettingsLabel}
          className={({ isActive }) =>
            cn(
              "relative grid size-9 place-items-center rounded-full text-muted transition-[color,background-color] duration-fast ease-standard",
              "hover:bg-surface hover:text-content",
              // Visible control stays 36px; the hit area reaches 44×44 without
              // touching the Brand link (hit-areas.md: expand, don't collide).
              "after:absolute after:-inset-1 after:content-['']",
              isActive && "bg-surface text-content",
            )
          }
        >
          <Settings className="size-4.5" strokeWidth={2} absoluteStrokeWidth aria-hidden="true" />
        </NavLink>
      </div>
    </header>
  );
}
