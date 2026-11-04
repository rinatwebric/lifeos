import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-raised",
        className,
      )}
    >
      {children}
    </section>
  );
}
