import { z } from "zod";

import { PROFILE_LANGUAGES, PROFILE_THEMES } from "@/types/domain";

const timeField = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM (24-hour).");

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
