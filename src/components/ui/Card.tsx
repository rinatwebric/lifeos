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
        "rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}