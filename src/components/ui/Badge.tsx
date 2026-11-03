import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "accent" | "outline";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-content",
  accent: "bg-accent text-accent-content",
  outline: "border border-line text-muted",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
