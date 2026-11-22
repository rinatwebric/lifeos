import { useEffect, useRef, useState } from "react";
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
import { Dialog } from "@/components/ui/Dialog";

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
 * The shared Dialog supplies modal focus and backdrop close; Escape and
 * backdrop close both run Skip.
 */
export function OnboardingDialog() {
  const m = useMessages();
  const t = m.onboarding;
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const skipInFlight = useRef(false);

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
    if (skipInFlight.current || dismissed) {
      return;
    }

    skipInFlight.current = true;
    setSkipping(true);
    setSkipError(null);

    try {
      await markOnboarded();
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
      setDismissed(true);
    } catch (error) {
      setSkipError(error instanceof Error ? error.message : t.fallbackError);
    } finally {
      skipInFlight.current = false;
      setSkipping(false);
    }
  };

  // Dialog owns native Escape in a browser; this listener also covers jsdom
  // and older engines where native close events are unavailable. Preventing
  // the default keeps the dialog mounted when Skip itself fails.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void handleSkip();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The ref makes `handleSkip` safe to capture once per dismissal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed]);

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
    <Dialog open onClose={() => void handleSkip()} title={t.title} description={t.description}>
      <div className="space-y-5">
        {loading ? (
          <div aria-busy="true" className="space-y-3">
            <p role="status" className="text-caption text-muted">
              {t.loading}
            </p>
            <div aria-hidden="true" className="space-y-3">
              <div className="h-11 w-full rounded-control bg-surface-muted" />
              <div className="h-11 w-4/5 rounded-control bg-surface-muted" />
              <div className="h-3 w-1/2 rounded-full bg-surface-muted" />
            </div>
          </div>
        ) : loadFailed ? (
          <p role="alert" className="text-caption text-danger">
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

        <div className="space-y-3 border-t border-line pt-4">
          {skipError ? (
            <p role="alert" className="text-caption text-danger">
              {skipError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full"
            onClick={() => void handleSkip()}
            disabled={skipping}
            loading={skipping}
          >
            {skipping ? t.skipping : t.skip}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
