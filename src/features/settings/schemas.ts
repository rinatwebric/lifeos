import { z } from "zod";

import {
  PROFILE_LANGUAGES,
  PROFILE_THEMES,
  WEEKDAYS,
  type AvailabilityWindows,
} from "@/types/domain";

const WALL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeField = z.string().regex(WALL_TIME_PATTERN, "Use HH:MM (24-hour).");

/** Day-setup block shared by Settings and the onboarding dialog. */
export const preferencesFormSchema = z
  .object({
    timezone: z.string().trim().min(1, "Timezone is required."),
    wakeUpTime: timeField,
    sleepTime: timeField,
  })
  .refine((values) => values.wakeUpTime !== values.sleepTime, {
    message: "Wake-up and sleep times must differ.",
    path: ["sleepTime"],
  });

export type PreferencesFormValues = z.infer<typeof preferencesFormSchema>;

/** Profile block owned by Settings only (email is read-only from session). */
export const profileFormSchema = z.object({
  fullName: z.string().trim().max(80, "Name must be 80 characters or fewer.").optional(),
  language: z.enum(PROFILE_LANGUAGES),
  theme: z.enum(PROFILE_THEMES),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** Availability rules shared by the form and its tests. */
export const MAX_WINDOWS_PER_DAY = 6;

export const AVAILABILITY_MESSAGES = {
  endAfterStart: "End time must be after start time.",
  overlap: "Time windows must not overlap.",
  tooManyWindows: `Use at most ${MAX_WINDOWS_PER_DAY} time windows per day.`,
  allDays: "Availability must cover all seven days.",
} as const;

const availabilityWindowSchema = z
  .object({
    start: timeField,
    end: timeField,
  })
  .refine((window) => window.start < window.end, {
    message: AVAILABILITY_MESSAGES.endAfterStart,
    path: ["end"],
  });

/**
 * Windows of one day. An empty array is valid: it means "this day is not
 * set" and the write path drops the key entirely (see `daysToAvailability`).
 * Overlap is checked on the sorted pairs; malformed times skip the check so
 * the HH:MM message is the one the user sees.
 */
const dayWindowsSchema = z
  .array(availabilityWindowSchema)
  .max(MAX_WINDOWS_PER_DAY, AVAILABILITY_MESSAGES.tooManyWindows)
  .superRefine((windows, ctx) => {
    const sorted = windows
      .filter(
        (window) => WALL_TIME_PATTERN.test(window.start) && WALL_TIME_PATTERN.test(window.end),
      )
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].start < sorted[index - 1].end) {
        ctx.addIssue({ code: "custom", message: AVAILABILITY_MESSAGES.overlap });
        return;
      }
    }
  });

export const availabilityDaySchema = z.object({
  day: z.enum(WEEKDAYS),
  windows: dayWindowsSchema,
});

/**
 * Settings form model: all seven days in calendar order, so the grid never
 * depends on which keys happen to exist in the JSONB object.
 */
export const availabilityFormSchema = z.object({
  days: z.array(availabilityDaySchema).length(WEEKDAYS.length, AVAILABILITY_MESSAGES.allDays),
});

export type AvailabilityDayValues = z.infer<typeof availabilityDaySchema>;
export type AvailabilityFormValues = z.infer<typeof availabilityFormSchema>;

/** JSONB → form: every weekday becomes a row, missing keys become empty rows. */
export function availabilityToDays(windows: AvailabilityWindows): AvailabilityDayValues[] {
  return WEEKDAYS.map((day) => ({
    day,
    windows: (windows[day] ?? []).map((window) => ({ start: window.start, end: window.end })),
  }));
}

/** Form → JSONB: an empty day is dropped, so `{}` stays the "not set" shape. */
export function daysToAvailability(days: readonly AvailabilityDayValues[]): AvailabilityWindows {
  const availability: AvailabilityWindows = {};

  for (const entry of days) {
    if (entry.windows.length > 0) {
      availability[entry.day] = entry.windows.map((window) => ({
        start: window.start,
        end: window.end,
      }));
    }
  }

  return availability;
}
