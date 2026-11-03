import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";

import { preferencesQueryKey, profileQueryKey, updatePreferences, updateProfile } from "./api";
import { preferencesFormSchema, type PreferencesFormValues } from "./schemas";
import { zodResolver } from "@/features/auth/resolver";
import { cn } from "@/lib/cn";

export const PREFERENCES_FORM_COPY = {
  timezoneLabel: "Time zone",
  timezonePlaceholder: "Asia/Bishkek",
  timezoneHint: "IANA time zone, e.g. Asia/Bishkek.",
  wakeLabel: "Wake-up time",
  sleepLabel: "Sleep time",
  submit: "Save day setup",
  saving: "Saving…",
  saved: "Day setup saved.",
  profileErrorPrefix: "Could not save profile (time zone).",
  preferencesErrorPrefix: "Could not save preferences (wake-up/sleep).",
} as const;

interface PreferencesFormProps {
  defaultValues: PreferencesFormValues;
  /** Called after both tables saved; onboarding uses it to mark onboarded. */
  onSaved?: () => void | Promise<void>;
  submitLabel?: string;
  idPrefix?: string;
}

/**
 * Shared day-setup form (time zone + wake/sleep). Owns the two-table save:
 * `profiles.timezone` and `user_preferences` wake/sleep are updated
 * independently, each failure is reported separately, and only the fulfilled
 * query keys are invalidated (never `clear()`).
 */
export function PreferencesForm({
  defaultValues,
  onSaved,
  submitLabel = PREFERENCES_FORM_COPY.submit,
  idPrefix = "prefs",
}: PreferencesFormProps) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues,
  });

  const onSubmit = async (values: PreferencesFormValues): Promise<void> => {
    setProfileError(null);
    setPreferencesError(null);
    setSaved(false);
    setIsPending(true);

    try {
      const [profileResult, preferencesResult] = await Promise.allSettled([
        updateProfile({ timezone: values.timezone }),
        updatePreferences({ wakeUpTime: values.wakeUpTime, sleepTime: values.sleepTime }),
      ]);

      let ok = true;

      if (profileResult.status === "fulfilled") {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey });
      } else {
        ok = false;
        setProfileError(
          `${PREFERENCES_FORM_COPY.profileErrorPrefix} ${messageOf(profileResult.reason)}`,
        );
      }

      if (preferencesResult.status === "fulfilled") {
        await queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
      } else {
        ok = false;
        setPreferencesError(
          `${PREFERENCES_FORM_COPY.preferencesErrorPrefix} ${messageOf(preferencesResult.reason)}`,
        );
      }

      if (ok) {
        setSaved(true);
        await onSaved?.();
      }
    } finally {
      setIsPending(false);
    }
  };

  const timezoneId = `${idPrefix}-timezone`;
  const wakeId = `${idPrefix}-wake`;
  const sleepId = `${idPrefix}-sleep`;

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={timezoneId} className="block text-sm font-medium text-content">
          {PREFERENCES_FORM_COPY.timezoneLabel}
        </label>
        <input
          id={timezoneId}
          type="text"
          autoComplete="off"
          placeholder={PREFERENCES_FORM_COPY.timezonePlaceholder}
          aria-invalid={errors.timezone ? true : undefined}
          aria-describedby={errors.timezone ? `${timezoneId}-error` : `${timezoneId}-hint`}
          disabled={isPending}
          className={cn(
            "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content",
            "placeholder:text-muted focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
            errors.timezone ? "border-red-400" : "border-line",
          )}
          {...register("timezone")}
        />
        {errors.timezone ? (
          <p
            id={`${timezoneId}-error`}
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            {errors.timezone.message}
          </p>
        ) : (
          <p id={`${timezoneId}-hint`} className="text-xs text-muted">
            {PREFERENCES_FORM_COPY.timezoneHint}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={wakeId} className="block text-sm font-medium text-content">
            {PREFERENCES_FORM_COPY.wakeLabel}
          </label>
          <input
            id={wakeId}
            type="time"
            aria-invalid={errors.wakeUpTime ? true : undefined}
            aria-describedby={errors.wakeUpTime ? `${wakeId}-error` : undefined}
            disabled={isPending}
            className={cn(
              "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content",
              "focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
              errors.wakeUpTime ? "border-red-400" : "border-line",
            )}
            {...register("wakeUpTime")}
          />
          {errors.wakeUpTime ? (
            <p
              id={`${wakeId}-error`}
              role="alert"
              className="text-xs text-red-600 dark:text-red-400"
            >
              {errors.wakeUpTime.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={sleepId} className="block text-sm font-medium text-content">
            {PREFERENCES_FORM_COPY.sleepLabel}
          </label>
          <input
            id={sleepId}
            type="time"
            aria-invalid={errors.sleepTime ? true : undefined}
            aria-describedby={errors.sleepTime ? `${sleepId}-error` : undefined}
            disabled={isPending}
            className={cn(
              "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content",
              "focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
              errors.sleepTime ? "border-red-400" : "border-line",
            )}
            {...register("sleepTime")}
          />
          {errors.sleepTime ? (
            <p
              id={`${sleepId}-error`}
              role="alert"
              className="text-xs text-red-600 dark:text-red-400"
            >
              {errors.sleepTime.message}
            </p>
          ) : null}
        </div>
      </div>

      {profileError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {profileError}
        </p>
      ) : null}
      {preferencesError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {preferencesError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-green-700 dark:text-green-300">
          {PREFERENCES_FORM_COPY.saved}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-content transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? PREFERENCES_FORM_COPY.saving : submitLabel}
      </button>
    </form>
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : "Please try again.";
}
