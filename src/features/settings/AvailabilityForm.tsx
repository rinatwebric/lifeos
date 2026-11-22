import { useEffect, useState } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";

import { getPreferences, preferencesQueryKey, updatePreferences } from "./api";
import {
  MAX_WINDOWS_PER_DAY,
  availabilityFormSchema,
  availabilityToDays,
  daysToAvailability,
  type AvailabilityDayValues,
  type AvailabilityFormValues,
} from "./schemas";
import { Button } from "@/components/ui/Button";
import { TimePicker } from "@/components/ui/TimePicker";
import { useMessages } from "@/lib/i18n/I18nContext";
import { tmpl } from "@/lib/i18n/format";
import { type Weekday } from "@/types/domain";

export const AVAILABILITY_COPY = {
  title: "Available time",
  hint: "The hours you usually work. The planner keeps other plans out of these windows and warns when something lands here.",
  limitHint: "Add up to 6 windows per day. Leave a day empty if it does not apply.",
  emptyDay: "Not set",
  addWindow: "Add window",
  removeWindow: "Remove window",
  submit: "Save available time",
  saving: "Saving…",
  saved: "Available time saved.",
  saveErrorPrefix: "Could not save available time.",
  loading: "Loading available time…",
  loadError: "Could not load available time.",
  retry: "Retry",
} as const;

/** New windows start on a neutral hour; the user edits both ends anyway. */
const NEW_WINDOW = { start: "09:00", end: "10:00" } as const;

/**
 * Availability windows (`user_preferences.working_hours`) edited as seven day
 * rows. The JSONB arrives with the preferences query, so the form cannot be
 * seeded from props: it seeds itself and calls `reset()` in an effect whenever
 * new server data lands (the project's stale-form pitfall).
 *
 * Load and save failures are two separate blocks: a failed load shows Retry
 * and never a half-filled form, a failed save keeps the edits on screen.
 */
export function AvailabilityForm() {
  const m = useMessages();
  const t = m.availability;
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: { days: availabilityToDays({}) },
  });

  const data = preferencesQuery.data;

  useEffect(() => {
    if (!data) {
      return;
    }

    reset({ days: availabilityToDays(data.workingHours) });
  }, [data, reset]);

  const days = useWatch({ control, name: "days" });

  const weekdayLabel = (day: Weekday): string => t.weekdays[day];

  const fieldName = (dayLabel: string, position: number, part: "start" | "end"): string =>
    tmpl(t.windowField, { day: dayLabel, position, part });

  const updateWindows = (dayIndex: number, windows: AvailabilityDayValues["windows"]): void => {
    setSaveError(null);
    setSaved(false);
    setValue(`days.${dayIndex}.windows`, windows, { shouldDirty: true });
  };

  const addWindow = (dayIndex: number): void => {
    const day = days[dayIndex];

    if (!day || day.windows.length >= MAX_WINDOWS_PER_DAY) {
      return;
    }

    updateWindows(dayIndex, [...day.windows, { ...NEW_WINDOW }]);
  };

  const setWindowTime = (
    dayIndex: number,
    windowIndex: number,
    part: "start" | "end",
    value: string,
  ): void => {
    setSaveError(null);
    setSaved(false);
    setValue(`days.${dayIndex}.windows.${windowIndex}.${part}`, value, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const removeWindow = (dayIndex: number, windowIndex: number): void => {
    const day = days[dayIndex];

    if (!day) {
      return;
    }

    updateWindows(
      dayIndex,
      day.windows.filter((_, index) => index !== windowIndex),
    );
  };

  const onSubmit = async (values: AvailabilityFormValues): Promise<void> => {
    setSaveError(null);
    setSaved(false);

    try {
      await updatePreferences({ workingHours: daysToAvailability(values.days) });
      await queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
      setSaved(true);
    } catch (error) {
      setSaveError(`${t.saveErrorPrefix} ${messageOf(error, t.fallbackError)}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-[15px] leading-snug font-medium text-content">{t.title}</h2>
        <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">{t.hint}</p>
      </div>

      {preferencesQuery.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p role="status" className="text-caption text-muted">
            {t.loading}
          </p>
          <div aria-hidden="true" className="space-y-3">
            <div className="h-11 w-full rounded-control bg-surface-muted" />
            <div className="h-11 w-4/5 rounded-control bg-surface-muted" />
            <div className="h-3 w-1/2 rounded-full bg-surface-muted" />
          </div>
        </div>
      ) : null}

      {preferencesQuery.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-caption text-danger">
            {t.loadError}
          </p>
          <Button
            variant="secondary"
            type="button"
            className="min-h-11"
            onClick={() => void preferencesQuery.refetch()}
          >
            {m.common.retry}
          </Button>
        </div>
      ) : null}

      {data ? (
        <form
          noValidate
          aria-busy={isSubmitting || undefined}
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="space-y-5"
        >
          <p className="max-w-2xl text-caption leading-relaxed text-muted">{t.limitHint}</p>

          <div className="space-y-6">
            {days.map((day, dayIndex) => {
              const dayLabel = weekdayLabel(day.day);
              const dayError = errorAt(errors, "days", dayIndex, "windows");

              return (
                <div
                  key={day.day}
                  role="group"
                  aria-labelledby={`availability-day-${day.day}`}
                  className="min-w-0 space-y-2.5 border-t border-line pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id={`availability-day-${day.day}`}
                      className="text-ui font-medium text-content"
                    >
                      {dayLabel}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="min-h-9 shrink-0 px-2 text-muted hover:text-content"
                      disabled={isSubmitting || day.windows.length >= MAX_WINDOWS_PER_DAY}
                      onClick={() => addWindow(dayIndex)}
                    >
                      {t.addWindow}
                    </Button>
                  </div>

                  {day.windows.length === 0 ? (
                    <p className="text-caption text-muted">{t.emptyDay}</p>
                  ) : (
                    <ul className="space-y-3">
                      {day.windows.map((_window, windowIndex) => {
                        const position = windowIndex + 1;
                        const startId = `availability-${day.day}-${windowIndex}-start`;
                        const endId = `availability-${day.day}-${windowIndex}-end`;
                        const startError = errorAt(
                          errors,
                          "days",
                          dayIndex,
                          "windows",
                          windowIndex,
                          "start",
                        );
                        const endError = errorAt(
                          errors,
                          "days",
                          dayIndex,
                          "windows",
                          windowIndex,
                          "end",
                        );
                        const message = startError ?? endError;
                        const messageId = `${startId}-error`;

                        return (
                          <li
                            key={`${day.day}-${windowIndex}`}
                            className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center"
                          >
                            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                              <div className="min-w-0">
                                <label htmlFor={startId} className="sr-only">
                                  {fieldName(dayLabel, position, "start")}
                                </label>
                                <TimePicker
                                  id={startId}
                                  value={day.windows[windowIndex]?.start ?? ""}
                                  invalid={Boolean(startError)}
                                  aria-describedby={message ? messageId : undefined}
                                  disabled={isSubmitting}
                                  className="min-w-0"
                                  onChange={(next) =>
                                    setWindowTime(dayIndex, windowIndex, "start", next)
                                  }
                                />
                              </div>

                              <span aria-hidden="true" className="text-caption text-muted">
                                {m.common.to}
                              </span>

                              <div className="min-w-0">
                                <label htmlFor={endId} className="sr-only">
                                  {fieldName(dayLabel, position, "end")}
                                </label>
                                <TimePicker
                                  id={endId}
                                  value={day.windows[windowIndex]?.end ?? ""}
                                  invalid={Boolean(endError)}
                                  aria-describedby={message ? messageId : undefined}
                                  disabled={isSubmitting}
                                  className="min-w-0"
                                  onChange={(next) =>
                                    setWindowTime(dayIndex, windowIndex, "end", next)
                                  }
                                />
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              className="min-h-11 shrink-0 self-end px-2 sm:self-auto"
                              aria-label={`${t.removeWindowLabel}: ${fieldName(
                                dayLabel,
                                position,
                                "start",
                              )}`}
                              disabled={isSubmitting}
                              onClick={() => removeWindow(dayIndex, windowIndex)}
                            >
                              {t.removeWindow}
                            </Button>

                            {message ? (
                              <p
                                id={messageId}
                                role="alert"
                                className="basis-full text-caption text-danger"
                              >
                                {message}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {dayError ? (
                    <p role="alert" className="text-caption text-danger">
                      {dayError}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {saveError ? (
            <p role="alert" className="text-caption text-danger">
              {saveError}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-caption text-success">
              {t.saved}
            </p>
          ) : null}

          <Button
            type="submit"
            className="min-h-11 w-full sm:w-auto"
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? t.saving : t.submit}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Reads `errors.days[i].windows[j].field.message` without fighting RHF's array
 * typings. Returns the message of that node when one is present.
 */
function errorAt(
  root: FieldErrors<AvailabilityFormValues>,
  ...path: (string | number)[]
): string | undefined {
  let node: unknown = root;

  for (const segment of path) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }

    node = (node as Record<string | number, unknown>)[segment];
  }

  if (node === null || typeof node !== "object") {
    return undefined;
  }

  const message = (node as { message?: unknown }).message;

  return typeof message === "string" ? message : undefined;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
