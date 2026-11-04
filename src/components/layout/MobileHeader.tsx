import { Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

export function MobileHeader() {
  const m = useMessages();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
      <Brand />
      <NavLink
        to="/settings"
        aria-label={m.layout.mobileHeaderSettingsLabel}
        className={({ isActive }) =>
          cn(
            "relative grid size-9 place-items-center rounded-control text-muted transition-[color,background-color] duration-fast ease-standard hover:bg-surface-muted hover:text-content",
            // Visible control stays 36px; the hit area reaches 44×44 without
            // touching the Brand link (hit-areas.md: expand, don't collide).
            "after:absolute after:-inset-1 after:content-['']",
            isActive && "bg-canvas text-content",
          )
        }
      >
        <Settings className="size-4.5" strokeWidth={2} absoluteStrokeWidth aria-hidden="true" />
      </NavLink>
    </header>
  );
}
