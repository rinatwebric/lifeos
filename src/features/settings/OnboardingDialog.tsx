import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PreferencesForm } from "./PreferencesForm";
import {
  getPreferences,
  getProfile,
  markOnboarded,
  preferencesQueryKey,
  profileQueryKey,
} from "./api";
import { useAuth } from "@/features/auth/useAuth";
import { isSupabaseConfigured } from "@/lib/env";
import { useMessages } from "@/lib/i18n/I18nContext";
import { toWallTime } from "@/lib/dates";
import { Button } from "@/components/ui/Button";

export const ONBOARDING_COPY = {
  title: "Set up your day",
  description:
    "Tell us your time zone and sleep schedule so the planner knows your day. You can change this later in Settings.",
  skip: "Skip",
  skipping: "Skipping…",
  save: "Save and continue",
  loading: "Loading your profile…",
  loadError: "Could not load your profile. You can skip for now and set it up later in Settings.",
} as const;

/**
 * One-step onboarding hint, not a route gate. Mounted by `AppLayout` only
 * when `profiles.onboarded_at IS NULL`. Both Save (after the day setup
 * lands) and Skip write `onboarded_at` so the dialog never returns.
 * Escape acts as Skip. No focus trap: tab navigation keeps working.
 */
export function OnboardingDialog() {
  const m = useMessages();
  const t = m.onboarding;
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

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

  const handleSkip = async (): Promise<void> => {
    if (skipping || dismissed) {
      return;
    }

    setSkipping(true);
    setSkipError(null);

    try {
      await markOnboarded();
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
      setDismissed(true);
    } catch (error) {
      setSkipError(error instanceof Error ? error.message : t.fallbackError);
    } finally {
      setSkipping(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        void handleSkip();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `handleSkip` is stable enough via refs; re-subscribing on every render
    // would churn listeners. Skipping state is read inside the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipping, dismissed]);

  if (dismissed) {
    return null;
  }

  const loading = profileQuery.isPending || preferencesQuery.isPending;
  const loadFailed = profileQuery.isError || preferencesQuery.isError;

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  // Same PostgREST "HH:MM:SS" normalization as SettingsPage: the dialog seeds
  // the strict "HH:MM"-only form, so raw `time` values must not reach it.
  const wakeUpTime = toWallTime(preferencesQuery.data?.wakeUpTime) ?? "07:00";
  const sleepTime = toWallTime(preferencesQuery.data?.sleepTime) ?? "23:00";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/80 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-overlay">
        <h2 id="onboarding-title" className="text-heading font-semibold tracking-tight text-content">
          {t.title}
        </h2>
        <p className="mt-1 text-ui text-muted">{t.description}</p>

        <div className="mt-4">
          {loading ? (
            <p role="status" className="text-ui text-muted">
              {t.loading}
            </p>
          ) : loadFailed ? (
            <p role="alert" className="text-ui text-danger">
              {t.loadError}
            </p>
          ) : (
            <PreferencesForm
              key={`${profileQuery.data?.timezone ?? browserZone}-${wakeUpTime}-${sleepTime}`}
              defaultValues={{
                timezone: profileQuery.data?.timezone ?? browserZone,
                wakeUpTime,
                sleepTime,
              }}
              submitLabel={t.save}
              idPrefix="onboarding"
              onSaved={async () => {
                await markOnboarded();
                await queryClient.invalidateQueries({ queryKey: profileQueryKey });
                setDismissed(true);
              }}
            />
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {skipError ? (
            <p role="alert" className="text-micro text-danger">
              {skipError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void handleSkip()}
            disabled={skipping}
            loading={skipping}
          >
            {skipping ? t.skipping : t.skip}
          </Button>
        </div>
      </div>
    </div>
  );
}
