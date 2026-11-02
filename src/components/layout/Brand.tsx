import { Link } from "react-router-dom";

import { cn } from "@/lib/cn";

interface BrandProps {
  showTagline?: boolean;
  className?: string;
}

export function Brand({ showTagline = false, className }: BrandProps) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5", className)}
      aria-label="LifeOS home"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-content">
        L
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-content">LifeOS</span>
        {showTagline ? (
          <span className="text-[11px] text-muted">Personal operating system</span>
        ) : null}
      </span>
    </Link>
  );
}
