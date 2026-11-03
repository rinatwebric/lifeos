import { cn } from "@/lib/cn";

interface ProgressBarProps {
  /** 0–100, or `null` when there is nothing to measure yet. */
  value: number | null;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  if (value === null) {
    return <p className="text-xs text-muted">{label ?? "No progress yet."}</p>;
  }

  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
