import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

export interface TimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "data-autofocus"?: boolean;
}

const PATTERN_TIME = /^(\d{2}):(\d{2})/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parse(value: string): { hour: number; minute: number } | null {
  const match = PATTERN_TIME.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * A neutral 24-hour time field. The native `input[type=time]` popup is owned by
 * the OS (and blue on Windows), so it cannot follow the app's language.
 */
export function TimePicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
  clearable,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "data-autofocus": dataAutofocus,
}: TimePickerProps) {
  const m = useMessages();
  const t = m.datePicker;
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 216;
      const dialog = trigger.closest("dialog");
      const boundaryBottom = dialog
        ? Math.min(window.innerHeight, dialog.getBoundingClientRect().bottom)
        : window.innerHeight;
      const spaceBelow = boundaryBottom - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + 8, left, width }
          : { top: Math.min(rect.bottom + 8, window.innerHeight - 8), left, width },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const setPart = (part: "hour" | "minute", raw: string): void => {
    const base = selected ?? { hour: 9, minute: 0 };
    onChange(part === "hour" ? `${raw}:${pad(base.minute)}` : `${pad(base.hour)}:${raw}`);
  };

  return (
    <div ref={rootRef} className={cn("relative w-full min-w-0", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        data-autofocus={dataAutofocus}
        data-value={value}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid || invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 min-h-11 w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 text-left text-base text-content transition-[border-color,background-color] duration-fast ease-standard",
          "sm:min-h-10 sm:text-ui",
          "hover:border-muted",

          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid ? "border-danger" : "border-control",
        )}
      >
        <span className={cn("min-w-0 truncate tabular-nums", !selected && "text-muted")}>
          {selected ? `${pad(selected.hour)}:${pad(selected.minute)}` : t.selectTime}
        </span>
        <Clock className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open && position ? (
        <div
          role="dialog"
          aria-label={t.time}
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
          }}
          className="fixed z-[60] overflow-hidden rounded-card border border-line bg-surface p-3 shadow-overlay"
        >
          <div className="flex items-center justify-center gap-1.5">
            <Select
              aria-label={t.hours}
              value={pad(selected?.hour ?? 9)}
              onChange={(event) => setPart("hour", event.target.value)}
              containerClassName="w-[4.6rem] shrink-0"
              className="h-9 min-h-9 w-full text-ui tabular-nums"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={pad(hour)}>
                  {pad(hour)}
                </option>
              ))}
            </Select>
            <span aria-hidden="true" className="text-muted">
              :
            </span>
            <Select
              aria-label={t.minutes}
              value={pad(selected?.minute ?? 0)}
              onChange={(event) => setPart("minute", event.target.value)}
              containerClassName="w-[4.6rem] shrink-0"
              className="h-9 min-h-9 w-full text-ui tabular-nums"
            >
              {Array.from({ length: 60 }, (_, minute) => (
                <option key={minute} value={pad(minute)}>
                  {pad(minute)}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            {clearable && value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="text-ui text-muted transition-colors hover:text-content"
              >
                {t.clear}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="inline-flex h-9 items-center rounded-pill bg-content px-4 text-ui font-medium text-canvas transition-opacity hover:opacity-90"
            >
              {t.done}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
