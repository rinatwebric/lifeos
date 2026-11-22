import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * A surface one tone step above the page, squared to the 20px card radius.
 * No elevation at rest: depth comes from lightness, not from a blur.
 */
export function Card({ children, className }: CardProps) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-5", className)}>
      {children}
    </section>
  );
}
