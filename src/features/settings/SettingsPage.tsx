import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PreferencesForm } from "./PreferencesForm";
import { AvailabilityForm } from "./AvailabilityForm";
import {
  getPreferences,
  getProfile,
  preferencesQueryKey,
  profileQueryKey,
  updateProfile,
} from "./api";
import { profileFormSchema, type ProfileFormValues } from "./schemas";
import { applyTheme } from "@/app/theme";
import { useAuth } from "@/features/auth/useAuth";
import { signOut } from "@/features/auth/api";
import { zodResolver } from "@/features/auth/resolver";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured } from "@/lib/env";
import { toWallTime } from "@/lib/dates";

export const SETTINGS_COPY = {
  title: "Settings",
  description: "Profile, time zone, working hours and preferences.",
  emailLabel: "Email",
  emailHint: "Sign-in email. It cannot be changed here.",
  nameLabel: "Full name",
  namePlaceholder: "Ada Lovelace",
  languageLabel: "Language",
  languageHint: "Stored in your profile. Interface translation lands in a later iteration.",
  themeLabel: "Theme",
  profileSubmit: "Save profile",
  profileSaving: "Saving…",
  profileSaved: "Profile saved.",
  loading: "Loading settings…",
  loadError: "Could not load settings.",
  retry: "Retry",
  notConfigured: "Supabase is not connected, so settings are unavailable.",
  signOutTitle: "Sign out",
  signOutHint: "Ends the session on this device. You can sign in again any time.",
  signOut: "Sign out",
  signingOut: "Signing out…",
  signOutFailed: "Could not sign out. Please try again.",
} as const;

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "ky", label: "Кыргызча" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function SettingsPage() {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();

  const enabled = status === "authenticated" && isSupabaseConfigured;

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled,
    staleTime: 60_000,
  });
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    enabled,
    staleTime: 60_000,
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />
        <p role="status" className="text-ui text-muted">
          {SETTINGS_COPY.notConfigured}
        </p>
      </div>
    );
  }

  if (profileQuery.isPending || preferencesQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />
        <p role="status" className="text-ui text-muted">
          {SETTINGS_COPY.loading}
        </p>
      </div>
    );
  }

  if (
    profileQuery.isError ||
    preferencesQuery.isError ||
    !profileQuery.data ||
    !preferencesQuery.data
  ) {
    return (
      <div className="space-y-6">
        <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />
        <p role="alert" className="text-ui text-danger">
          {SETTINGS_COPY.loadError}
        </p>
        <Button
          variant="secondary"
          className="w-full"
          type="button"
          onClick={() => {
            void profileQuery.refetch();
            void preferencesQuery.refetch();
          }}
        >
          {SETTINGS_COPY.retry}
        </Button>
      </div>
    );
  }

  const profile = profileQuery.data;
  const preferences = preferencesQuery.data;
  // PostgREST serializes `time` columns as "HH:MM:SS": normalize before the
  // values reach `PreferencesForm` (`input[type=time]` + strict zod would
  // otherwise reject its own defaults on save). Fallbacks match onboarding.
  const wakeUpTime = toWallTime(preferences.wakeUpTime) ?? "07:00";
  const sleepTime = toWallTime(preferences.sleepTime) ?? "23:00";

  return (
    <div className="space-y-6">
      <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />

      <Card className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="settings-email" className="block text-ui font-medium text-content">
            {SETTINGS_COPY.emailLabel}
          </label>
          <input
            id="settings-email"
            type="email"
            readOnly
            disabled
            value={user?.email ?? ""}
            className="h-10 w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-base text-muted sm:text-ui"
          />
          <p className="text-micro text-muted">{SETTINGS_COPY.emailHint}</p>
        </div>

        <ProfileForm
          key={`profile-${profile.fullName ?? ""}-${profile.language}-${profile.theme}`}
          defaultValues={{
            fullName: profile.fullName ?? "",
            language: profile.language,
            theme: profile.theme,
          }}
          onSavedTheme={(theme) => applyTheme(theme)}
          invalidate={() => queryClient.invalidateQueries({ queryKey: profileQueryKey })}
        />
      </Card>

      <Card className="space-y-4">
        <PreferencesForm
          key={`prefs-${profile.timezone}-${wakeUpTime}-${sleepTime}`}
          defaultValues={{
            timezone: profile.timezone,
            wakeUpTime,
            sleepTime,
          }}
          idPrefix="settings"
        />
      </Card>

      <Card className="space-y-4">
        <AvailabilityForm />
      </Card>

      <SignOutCard />
    </div>
  );
}

/**
 * Ends the session on this device. No navigation call needed: `signOut`
 * flips the auth status to anonymous and `RequireAuth` redirects to
 * `/sign-in` by itself.
 */
function SignOutCard() {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const onSignOut = async (): Promise<void> => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();
    } catch {
      setSignOutError(SETTINGS_COPY.signOutFailed);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-ui font-medium text-content">{SETTINGS_COPY.signOutTitle}</h2>
        <p className="text-micro text-muted">{SETTINGS_COPY.signOutHint}</p>
      </div>

      {signOutError ? (
        <p role="alert" className="text-micro text-danger">
          {signOutError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="danger"
        className="w-full"
        onClick={() => void onSignOut()}
        disabled={signingOut}
        loading={signingOut}
      >
        {signingOut ? SETTINGS_COPY.signingOut : SETTINGS_COPY.signOut}
      </Button>
    </Card>
  );
}

function ProfileForm({
  defaultValues,
  onSavedTheme,
  invalidate,
}: {
  defaultValues: ProfileFormValues;
  onSavedTheme: (theme: ProfileFormValues["theme"]) => void;
  invalidate: () => Promise<unknown>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
  });

  const onSubmit = async (values: ProfileFormValues): Promise<void> => {
    setServerError(null);
    setSaved(false);

    try {
      const trimmed = values.fullName?.trim();
      const updated = await updateProfile({
        fullName: trimmed ? trimmed : null,
        language: values.language,
        theme: values.theme,
      });
      onSavedTheme(updated.theme);
      await invalidate();
      setSaved(true);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4">
      <Field id="settings-name" label={SETTINGS_COPY.nameLabel} error={errors.fullName?.message}>
        <Input
          type="text"
          autoComplete="name"
          placeholder={SETTINGS_COPY.namePlaceholder}
          disabled={isSubmitting}
          {...register("fullName")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="settings-language"
          label={SETTINGS_COPY.languageLabel}
          hint={SETTINGS_COPY.languageHint}
        >
          <Select disabled={isSubmitting} {...register("language")}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="settings-theme" label={SETTINGS_COPY.themeLabel}>
          <Select disabled={isSubmitting} {...register("theme")}>
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-micro text-success">
          {SETTINGS_COPY.profileSaved}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? SETTINGS_COPY.profileSaving : SETTINGS_COPY.profileSubmit}
      </Button>
    </form>
  );
}
