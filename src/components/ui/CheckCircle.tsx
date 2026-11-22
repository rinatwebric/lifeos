import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

interface CheckCircleProps {
  id?: string;
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A round completion control. The input keeps native checkbox semantics for
 * tests/assistive tech; the visible circle and check are pure presentation.
 * The label may be larger than the circle so the hit area can reach 44px.
 */
export function CheckCircle({
  id,
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: CheckCircleProps) {
  return (
    <label className={cn("relative grid shrink-0 place-items-center", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onChange}
        className="peer size-[18px] cursor-pointer appearance-none rounded-full border border-control bg-transparent transition-[background-color,border-color] duration-fast ease-standard checked:border-content checked:bg-content disabled:cursor-not-allowed disabled:opacity-60"
      />
      <Check
        className="pointer-events-none absolute size-2.5 text-canvas opacity-0 peer-checked:opacity-100 peer-checked:motion-check"
        strokeWidth={3}
        aria-hidden="true"
      />
    </label>
  );
}
