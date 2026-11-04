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
import { useTheme } from "@/app/theme";
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
import { useLanguageSync, useMessages } from "@/lib/i18n/I18nContext";
import type { ProfileLanguage, ProfileTheme } from "@/types/domain";

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

const LANGUAGE_OPTIONS: ReadonlyArray<{ value: ProfileLanguage; labelKey: "en" | "ru" | "soon"; disabled?: boolean }> = [
  { value: "en", labelKey: "en" },
  { value: "ru", labelKey: "ru" },
  { value: "ky", labelKey: "soon", disabled: true },
];

const THEME_OPTIONS: ReadonlyArray<{ value: ProfileTheme; labelKey: "light" | "dark" }> = [
  { value: "light", labelKey: "light" },
  { value: "dark", labelKey: "dark" },
];

export function SettingsPage() {
  const m = useMessages();
  const t = m.settings;
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
        <PageHeader title={t.title} description={t.description} />
        <p role="status" className="text-ui text-muted">
          {t.notConfigured}
        </p>
      </div>
    );
  }

  if (profileQuery.isPending || preferencesQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} description={t.description} />
        <p role="status" className="text-ui text-muted">
          {t.loading}
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
        <PageHeader title={t.title} description={t.description} />
        <p role="alert" className="text-ui text-danger">
          {t.loadError}
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
          {m.common.retry}
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
      <PageHeader title={t.title} description={t.description} />

      <Card className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="settings-email" className="block text-ui font-medium text-content">
            {t.emailLabel}
          </label>
          <input
            id="settings-email"
            type="email"
            readOnly
            disabled
            value={user?.email ?? ""}
            className="h-10 w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-base text-muted sm:text-ui"
          />
          <p className="text-micro text-muted">{t.emailHint}</p>
        </div>

        {/* Stable key: account only. Language/theme changes must never remount
            the name field (draft wipe + focus loss). */}
        <ProfileNameForm
          key={`profile-name-${profile.id}`}
          defaultValues={{ fullName: profile.fullName ?? "" }}
          invalidate={() => queryClient.invalidateQueries({ queryKey: profileQueryKey })}
        />

        <InstantPreferences />
      </Card>

      <Card className="space-y-4">
        <PreferencesForm
          key={`prefs-${profile.id}-${profile.timezone}-${wakeUpTime}-${sleepTime}`}
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
 * Instant language/theme controls. No submit: choosing applies immediately
 * to the UI + device storage and syncs in the background (single-field
 * PATCH). Never touches the name/day forms, never steals focus.
 */
function InstantPreferences() {
  const m = useMessages();
  const t = m.settings;
  const {
    locale,
    setLocale,
    syncStatus: langStatus,
    syncError: langError,
    retrySync: retryLang,
    isKyFallback,
  } = useLanguageSync();
  const { theme, setTheme, syncStatus: themeStatus, syncError: themeError, retrySync: retryTheme } =
    useTheme();

  const languageLabel = (value: ProfileLanguage): string => {
    if (value === "en") return "English";
    if (value === "ru") return "Русский";
    return t.kySoon;
  };

  const themeLabel = (value: ProfileTheme): string =>
    value === "light" ? t.themeLight : t.themeDark;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field id="settings-language" label={t.languageLabel} hint={t.languageHint}>
          <Select
            id="settings-language"
            value={isKyFallback ? "ky" : locale}
            onChange={(event) => {
              const next = event.target.value as ProfileLanguage;
              if (next === "en" || next === "ru") {
                setLocale(next);
              }
            }}
            aria-describedby={isKyFallback ? "settings-language-ky-note" : undefined}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {languageLabel(option.value)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="settings-theme" label={t.themeLabel}>
          <Select
            id="settings-theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ProfileTheme)}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {themeLabel(option.value)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isKyFallback ? (
        <p id="settings-language-ky-note" role="note" className="text-micro text-muted">
          {t.languageUnavailable}
        </p>
      ) : null}

      <PreferenceSyncNotice
        status={langStatus}
        error={langError}
        onRetry={retryLang}
        savedText={t.syncSaved}
        savingText={t.syncSaving}
        errorText={m.common.notSavedInAccount}
        retryText={m.common.retrySync}
        testId="language-sync"
      />
      <PreferenceSyncNotice
        status={themeStatus}
        error={themeError}
        onRetry={retryTheme}
        savedText={t.syncSaved}
        savingText={t.syncSaving}
        errorText={m.common.notSavedInAccount}
        retryText={m.common.retrySync}
        testId="theme-sync"
      />
    </div>
  );
}

function PreferenceSyncNotice({
  status,
  error,
  onRetry,
  savedText,
  savingText,
  errorText,
  retryText,
  testId,
}: {
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
  onRetry: () => void;
  savedText: string;
  savingText: string;
  errorText: string;
  retryText: string;
  testId: string;
}) {
  if (status === "saving") {
    return (
      <p role="status" data-testid={`${testId}-saving`} className="text-micro text-muted">
        {savingText}
      </p>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" data-testid={`${testId}-error`} className="text-micro text-danger">
        {errorText} {error ? `(${error})` : null}{" "}
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-4"
        >
          {retryText}
        </button>
      </p>
    );
  }

  if (status === "saved") {
    return (
      <p role="status" data-testid={`${testId}-saved`} className="text-micro text-success">
        {savedText}
      </p>
    );
  }

  return null;
}

/**
 * Ends the session on this device. No navigation call needed: `signOut`
 * flips the auth status to anonymous and `RequireAuth` redirects to
 * `/sign-in` by itself.
 */
function SignOutCard() {
  const m = useMessages();
  const t = m.settings;
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
      setSignOutError(t.signOutFailed);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-ui font-medium text-content">{t.signOutTitle}</h2>
        <p className="text-micro text-muted">{t.signOutHint}</p>
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
        {signingOut ? t.signingOut : t.signOut}
      </Button>
    </Card>
  );
}

/** Name-only form. PATCHes `{fullName}` — never language/theme/timezone. */
function ProfileNameForm({
  defaultValues,
  invalidate,
}: {
  defaultValues: Pick<ProfileFormValues, "fullName">;
  invalidate: () => Promise<unknown>;
}) {
  const m = useMessages();
  const t = m.settings;
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Pick<ProfileFormValues, "fullName">>({
    resolver: zodResolver(profileFormSchema.pick({ fullName: true })),
    defaultValues,
  });

  const onSubmit = async (values: Pick<ProfileFormValues, "fullName">): Promise<void> => {
    setServerError(null);
    setSaved(false);

    try {
      const trimmed = values.fullName?.trim();
      await updateProfile({ fullName: trimmed ? trimmed : null });
      await invalidate();
      setSaved(true);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.profileSaved);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4">
      <Field id="settings-name" label={t.nameLabel} error={errors.fullName?.message}>
        <Input
          type="text"
          autoComplete="name"
          placeholder={t.namePlaceholder}
          disabled={isSubmitting}
          {...register("fullName")}
        />
      </Field>

      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-micro text-success">
          {t.nameSaved}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? t.nameSaving : t.nameSubmit}
      </Button>
    </form>
  );
}
