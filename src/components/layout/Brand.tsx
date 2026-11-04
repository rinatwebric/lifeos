import { Link } from "react-router-dom";

import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

interface BrandProps {
  showTagline?: boolean;
  className?: string;
}

export function Brand({ showTagline = false, className }: BrandProps) {
  const m = useMessages();

  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 rounded-control px-2 py-1.5", className)}
      aria-label={m.layout.brandHomeLabel}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-ui font-semibold text-accent-content">
        L
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-ui font-semibold tracking-tight text-content">LifeOS</span>
        {showTagline ? <span className="text-micro text-muted">{m.layout.brandTagline}</span> : null}
      </span>
    </Link>
  );
}
