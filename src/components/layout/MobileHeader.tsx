import { Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { cn } from "@/lib/cn";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
      <Brand />
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          cn(
            "grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-content",
            isActive && "bg-canvas text-content",
          )
        }
      >
        <Settings className="size-4.5" aria-hidden="true" />
      </NavLink>
    </header>
  );
}