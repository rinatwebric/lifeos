import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PreferencesForm } from "./PreferencesForm";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/cn";

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
        <p role="status" className="text-sm text-muted">
          {SETTINGS_COPY.notConfigured}
        </p>
      </div>
    );
  }

  if (profileQuery.isPending || preferencesQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />
        <p role="status" className="text-sm text-muted">
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
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {SETTINGS_COPY.loadError}
        </p>
        <button
          type="button"
          onClick={() => {
            void profileQuery.refetch();
            void preferencesQuery.refetch();
          }}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-content"
        >
          {SETTINGS_COPY.retry}
        </button>
      </div>
    );
  }

  const profile = profileQuery.data;
  const preferences = preferencesQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader title={SETTINGS_COPY.title} description={SETTINGS_COPY.description} />

      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <label htmlFor="settings-email" className="block text-sm font-medium text-content">
            {SETTINGS_COPY.emailLabel}
          </label>
          <input
            id="settings-email"
            type="email"
            readOnly
            disabled
            value={user?.email ?? ""}
            className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-muted"
          />
          <p className="text-xs text-muted">{SETTINGS_COPY.emailHint}</p>
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

      <Card className="space-y-4 p-5">
        <PreferencesForm
          key={`prefs-${profile.timezone}-${preferences.wakeUpTime}-${preferences.sleepTime}`}
          defaultValues={{
            timezone: profile.timezone,
            wakeUpTime: preferences.wakeUpTime,
            sleepTime: preferences.sleepTime,
          }}
          idPrefix="settings"
        />
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
    <Card className="space-y-3 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-content">{SETTINGS_COPY.signOutTitle}</h2>
        <p className="text-xs text-muted">{SETTINGS_COPY.signOutHint}</p>
      </div>

      {signOutError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {signOutError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void onSignOut()}
        disabled={signingOut}
        className="w-full rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-content transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signingOut ? SETTINGS_COPY.signingOut : SETTINGS_COPY.signOut}
      </button>
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
      <div className="space-y-1.5">
        <label htmlFor="settings-name" className="block text-sm font-medium text-content">
          {SETTINGS_COPY.nameLabel}
        </label>
        <input
          id="settings-name"
          type="text"
          autoComplete="name"
          placeholder={SETTINGS_COPY.namePlaceholder}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "settings-name-error" : undefined}
          disabled={isSubmitting}
          className={cn(
            "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content",
            "placeholder:text-muted focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
            errors.fullName ? "border-red-400" : "border-line",
          )}
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p
            id="settings-name-error"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="settings-language" className="block text-sm font-medium text-content">
            {SETTINGS_COPY.languageLabel}
          </label>
          <select
            id="settings-language"
            disabled={isSubmitting}
            aria-describedby="settings-language-hint"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content disabled:cursor-not-allowed disabled:opacity-60"
            {...register("language")}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p id="settings-language-hint" className="text-xs text-muted">
            {SETTINGS_COPY.languageHint}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-theme" className="block text-sm font-medium text-content">
            {SETTINGS_COPY.themeLabel}
          </label>
          <select
            id="settings-theme"
            disabled={isSubmitting}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content disabled:cursor-not-allowed disabled:opacity-60"
            {...register("theme")}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {serverError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {serverError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-green-700 dark:text-green-300">
          {SETTINGS_COPY.profileSaved}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-content transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? SETTINGS_COPY.profileSaving : SETTINGS_COPY.profileSubmit}
      </button>
    </form>
  );
}
