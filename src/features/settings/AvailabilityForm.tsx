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
import { Input } from "@/components/ui/Input";
import { useIntlLocale, useMessages } from "@/lib/i18n/I18nContext";
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

const WEEKDAY_ORDER: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
  const intl = useIntlLocale();
  void intl;
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
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
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-ui font-medium text-content">{t.title}</h2>
        <p className="text-caption text-muted">{t.hint}</p>
      </div>

      {preferencesQuery.isPending ? (
        <p role="status" className="text-ui text-muted">
          {t.loading}
        </p>
      ) : null}

      {preferencesQuery.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-ui text-danger">
            {t.loadError}
          </p>
          <Button variant="secondary" type="button" onClick={() => void preferencesQuery.refetch()}>
            {m.common.retry}
          </Button>
        </div>
      ) : null}

      {data ? (
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="space-y-4"
        >
          <p className="text-caption text-muted">{t.limitHint}</p>

          <div className="space-y-5">
            {days.map((day, dayIndex) => {
              const dayLabel = weekdayLabel(day.day);
              const dayError = errorAt(errors, "days", dayIndex, "windows");

              return (
                <fieldset key={day.day} className="space-y-2">
                  <legend className="text-ui font-medium text-content">{dayLabel}</legend>

                  {day.windows.length === 0 ? (
                    <p className="text-caption text-muted">{t.emptyDay}</p>
                  ) : (
                    <ul className="space-y-2">
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
                            className="flex flex-wrap items-center gap-2"
                          >
                            <div className="min-w-0 flex-1 basis-24">
                              <label htmlFor={startId} className="sr-only">
                                {fieldName(dayLabel, position, "start")}
                              </label>
                              <Input
                                id={startId}
                                type="time"
                                invalid={Boolean(startError)}
                                aria-describedby={message ? messageId : undefined}
                                disabled={isSubmitting}
                                {...register(`days.${dayIndex}.windows.${windowIndex}.start`, {
                                  onChange: () => {
                                    setSaveError(null);
                                    setSaved(false);
                                  },
                                })}
                              />
                            </div>

                            <span aria-hidden="true" className="text-caption text-muted">
                              {m.common.to}
                            </span>

                            <div className="min-w-0 flex-1 basis-24">
                              <label htmlFor={endId} className="sr-only">
                                {fieldName(dayLabel, position, "end")}
                              </label>
                              <Input
                                id={endId}
                                type="time"
                                invalid={Boolean(endError)}
                                aria-describedby={message ? messageId : undefined}
                                disabled={isSubmitting}
                                {...register(`days.${dayIndex}.windows.${windowIndex}.end`, {
                                  onChange: () => {
                                    setSaveError(null);
                                    setSaved(false);
                                  },
                                })}
                              />
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              className="shrink-0"
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
                                className="basis-full text-micro text-danger"
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
                    <p role="alert" className="text-micro text-danger">
                      {dayError}
                    </p>
                  ) : null}

                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={isSubmitting || day.windows.length >= MAX_WINDOWS_PER_DAY}
                    onClick={() => addWindow(dayIndex)}
                  >
                    {t.addWindow}
                  </Button>
                </fieldset>
              );
            })}
          </div>

          {saveError ? (
            <p role="alert" className="text-micro text-danger">
              {saveError}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-micro text-success">
              {t.saved}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? t.saving : t.submit}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

void WEEKDAY_ORDER;

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
