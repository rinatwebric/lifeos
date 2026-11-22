import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import { Select } from "@/components/ui/Select";

type PickerMode = "date" | "datetime";

export interface DateTimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  mode?: PickerMode;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  align?: "start" | "end";
  /** Calendar date used for the Today marker; defaults to the browser date. */
  todayKey?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "data-autofocus"?: boolean;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const PATTERN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PATTERN_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parse(value: string, mode: PickerMode): Parts | null {
  const match = (mode === "datetime" ? PATTERN_DATETIME : PATTERN_DATE).exec(value);
  if (!match) return null;

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] ? Number(match[4]) : 9,
    minute: match[5] ? Number(match[5]) : 0,
  };
  return Number.isFinite(parts.year) ? parts : null;
}

function dateKeyOf(parts: Pick<Parts, "year" | "month" | "day">): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function partsOfToday(): Parts {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first weekday offset for the first day of the month. */
function firstOffset(year: number, month: number): number {
  const day = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (day + 6) % 7;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(parts: Parts, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(parts.year, parts.month, parts.day));
}

function formatLabel(parts: Parts, mode: PickerMode, locale: string): string {
  const date = formatDate(parts, locale);
  return mode === "datetime" ? `${date}, ${pad(parts.hour)}:${pad(parts.minute)}` : date;
}

/**
 * A Studio calendar for wall-clock values. It deliberately does not use the
 * browser's native datetime-local popup: that popup is owned by the OS and
 * cannot follow the app's dark, neutral language. The value format stays the
 * same (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`), so forms and timezone helpers are
 * unchanged.
 */
export function DateTimePicker({
  id,
  value,
  onChange,
  mode = "datetime",
  invalid,
  disabled,
  clearable,
  align = "start",
  todayKey,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "data-autofocus": dataAutofocus,
}: DateTimePickerProps) {
  const m = useMessages();
  const t = m.datePicker;
  const locale = useLocale();
  const selected = parse(value, mode);
  const browserToday = partsOfToday();
  const todayAnchor = todayKey ? parse(todayKey, "date") : null;
  const today: Parts = todayAnchor
    ? { ...browserToday, year: todayAnchor.year, month: todayAnchor.month, day: todayAnchor.day }
    : browserToday;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    mobile?: boolean;
  } | null>(null);
  const [view, setView] = useState(() => {
    const initial = selected ?? today;
    return { year: initial.year, month: initial.month };
  });
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
      if (window.innerWidth < 640) {
        setPosition({
          left: 16,
          bottom: 16,
          width: window.innerWidth - 32,
          mobile: true,
        });
        return;
      }
      const width = Math.min(304, window.innerWidth - 16);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceAbove > spaceBelow;
      const left = Math.max(
        8,
        Math.min(align === "end" ? rect.right - width : rect.left, window.innerWidth - width - 8),
      );
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
  }, [open, align]);

  const weekdayLabels = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
        new Date(Date.UTC(2024, 0, 1 + index)),
      ),
    );
  }, [locale]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(view.year, view.month, 1));

  const totalDays = daysInMonth(view.year, view.month);
  const offset = firstOffset(view.year, view.month);
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= totalDays ? day : null;
  });

  const toggle = (): void => {
    if (disabled) return;
    if (!open) {
      const initial = selected ?? today;
      setView({ year: initial.year, month: initial.month });
    }
    setOpen((current) => !current);
  };

  const updateTime = (part: "hour" | "minute", raw: string): void => {
    const base = selected ?? { ...today, ...view, day: Math.min(today.day, totalDays) };
    const next = { ...base, [part]: Number(raw) };
    onChange(`${dateKeyOf(next)}T${pad(next.hour)}:${pad(next.minute)}`);
  };

  const pickDay = (day: number): void => {
    const next = {
      year: view.year,
      month: view.month,
      day,
      hour: selected?.hour ?? today.hour,
      minute: selected?.minute ?? today.minute,
    };
    if (mode === "date") {
      onChange(dateKeyOf(next));
      setOpen(false);
      return;
    }
    onChange(`${dateKeyOf(next)}T${pad(next.hour)}:${pad(next.minute)}`);
  };

  const clear = (): void => {
    onChange("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  const todayDateKey = dateKeyOf(today);
  const isToday = (day: number): boolean =>
    view.year === today.year && view.month === today.month && day === today.day;

  return (
    <div ref={rootRef} className={cn("relative w-full min-w-0", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        data-autofocus={dataAutofocus}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-value={value}
        aria-invalid={ariaInvalid || invalid || undefined}
        aria-describedby={describedBy}
        onClick={toggle}
        className={cn(
          "flex h-10 min-h-11 w-full items-center justify-between gap-3 rounded-control border bg-surface px-3 text-left text-base text-content transition-[border-color,background-color] duration-fast ease-standard",
          "sm:min-h-10 sm:text-ui",
          "hover:border-muted",
          "focus:border-content",
          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid ? "border-danger" : "border-control",
        )}
      >
        <span className={cn("min-w-0 truncate tabular-nums", !selected && "text-muted")}>
          {selected
            ? formatLabel(selected, mode, locale)
            : mode === "date"
              ? t.selectDate
              : t.selectDateTime}
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open && position ? (
        <div
          role="dialog"
          aria-label={mode === "date" ? t.calendar : t.selectDateTime}
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
          }}
          className={cn(
            "fixed z-[60] rounded-card border border-line bg-surface p-3 shadow-overlay",
            position.mobile && "scrollbar-neutral max-h-[calc(100dvh-2rem)] overflow-y-auto",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setView((current) => {
                  const nextMonth = current.month === 1 ? 12 : current.month - 1;
                  const nextYear = current.month === 1 ? current.year - 1 : current.year;
                  return { year: nextYear, month: nextMonth };
                })
              }
              aria-label={t.previousMonth}
              className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-content"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <p className="text-ui font-medium text-content capitalize">{monthLabel}</p>
            <button
              type="button"
              onClick={() =>
                setView((current) => {
                  const nextMonth = current.month === 12 ? 1 : current.month + 1;
                  const nextYear = current.month === 12 ? current.year + 1 : current.year;
                  return { year: nextYear, month: nextMonth };
                })
              }
              aria-label={t.nextMonth}
              className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-content"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="py-1 text-micro text-muted">
                {label}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />;
              const selectedDay =
                selected !== null &&
                selected.year === view.year &&
                selected.month === view.month &&
                selected.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  aria-pressed={selectedDay}
                  aria-label={new Intl.DateTimeFormat(locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(utcDate(view.year, view.month, day))}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-ui tabular-nums transition-colors",
                    selectedDay
                      ? "bg-content font-medium text-canvas"
                      : isToday(day)
                        ? "border border-control text-content hover:bg-surface-raised"
                        : "text-content hover:bg-surface-raised",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {mode === "datetime" ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-ui text-muted">{t.time}</span>
              <div className="flex items-center gap-1.5">
                <Select
                  aria-label={t.hours}
                  value={pad(selected?.hour ?? 9)}
                  onChange={(event) => updateTime("hour", event.target.value)}
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
                  onChange={(event) => updateTime("minute", event.target.value)}
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
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => {
                const next = today;
                if (mode === "date") {
                  onChange(todayDateKey);
                  setOpen(false);
                } else {
                  setView({ year: next.year, month: next.month });
                  onChange(`${todayDateKey}T${pad(next.hour)}:${pad(next.minute)}`);
                }
              }}
              className="text-ui text-muted transition-colors hover:text-content"
            >
              {t.today}
            </button>
            <div className="flex items-center gap-2">
              {clearable && value ? (
                <button
                  type="button"
                  onClick={clear}
                  className="text-ui text-muted transition-colors hover:text-content"
                >
                  {t.clear}
                </button>
              ) : null}
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
        </div>
      ) : null}
    </div>
  );
}

export type { PickerMode };
