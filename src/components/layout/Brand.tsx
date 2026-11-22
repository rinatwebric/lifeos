import { Link } from "react-router-dom";

import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

interface BrandProps {
  showTagline?: boolean;
  className?: string;
}

/** Orbit mark: one incomplete ring and one body. The product in miniature. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 shrink-0", className)}
      aria-hidden="true"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="7.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="34 12"
        strokeLinecap="round"
        transform="rotate(-38 12 12)"
      />
      <circle cx="18.4" cy="6.8" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function Brand({ showTagline = false, className }: BrandProps) {
  const m = useMessages();

  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 rounded-full px-2 py-1.5", className)}
      aria-label={m.layout.brandHomeLabel}
    >
      <BrandMark className="text-content" />
      <span className="flex flex-col leading-tight">
        <span className="text-ui font-semibold tracking-[-0.01em] text-content">LifeOS</span>
        {showTagline ? (
          <span className="text-micro text-muted">{m.layout.brandTagline}</span>
        ) : null}
      </span>
    </Link>
  );
}
