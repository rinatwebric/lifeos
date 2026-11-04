import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";

import { preferencesQueryKey, profileQueryKey, updatePreferences, updateProfile } from "./api";
import { preferencesFormSchema, type PreferencesFormValues } from "./schemas";
import { zodResolver } from "@/features/auth/resolver";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

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
      <Field
        id={timezoneId}
        label={PREFERENCES_FORM_COPY.timezoneLabel}
        hint={PREFERENCES_FORM_COPY.timezoneHint}
        error={errors.timezone?.message}
      >
        <Input
          type="text"
          autoComplete="off"
          placeholder={PREFERENCES_FORM_COPY.timezonePlaceholder}
          disabled={isPending}
          {...register("timezone")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id={wakeId} label={PREFERENCES_FORM_COPY.wakeLabel} error={errors.wakeUpTime?.message}>
          <Input type="time" disabled={isPending} {...register("wakeUpTime")} />
        </Field>

        <Field
          id={sleepId}
          label={PREFERENCES_FORM_COPY.sleepLabel}
          error={errors.sleepTime?.message}
        >
          <Input type="time" disabled={isPending} {...register("sleepTime")} />
        </Field>
      </div>

      {profileError ? (
        <p role="alert" className="text-micro text-danger">
          {profileError}
        </p>
      ) : null}
      {preferencesError ? (
        <p role="alert" className="text-micro text-danger">
          {preferencesError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-micro text-success">
          {PREFERENCES_FORM_COPY.saved}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending} loading={isPending}>
        {isPending ? PREFERENCES_FORM_COPY.saving : submitLabel}
      </Button>
    </form>
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : "Please try again.";
}
