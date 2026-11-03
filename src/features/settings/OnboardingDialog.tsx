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
      setSkipError(error instanceof Error ? error.message : "Please try again.");
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <h2 id="onboarding-title" className="text-lg font-semibold tracking-tight text-content">
          {ONBOARDING_COPY.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{ONBOARDING_COPY.description}</p>

        <div className="mt-4">
          {loading ? (
            <p role="status" className="text-sm text-muted">
              {ONBOARDING_COPY.loading}
            </p>
          ) : loadFailed ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {ONBOARDING_COPY.loadError}
            </p>
          ) : (
            <PreferencesForm
              key={`${profileQuery.data?.timezone ?? browserZone}-${preferencesQuery.data?.wakeUpTime ?? "07:00"}-${preferencesQuery.data?.sleepTime ?? "23:00"}`}
              defaultValues={{
                timezone: profileQuery.data?.timezone ?? browserZone,
                wakeUpTime: preferencesQuery.data?.wakeUpTime ?? "07:00",
                sleepTime: preferencesQuery.data?.sleepTime ?? "23:00",
              }}
              submitLabel={ONBOARDING_COPY.save}
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
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {skipError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={skipping}
            className="w-full rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {skipping ? ONBOARDING_COPY.skipping : ONBOARDING_COPY.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
