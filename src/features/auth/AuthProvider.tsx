import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { exchangeCodeFromUrl, getSession, onAuthStateChange } from "./api";
import { AuthContext, type AuthContextValue } from "./useAuth";
import { isSupabaseConfigured } from "@/lib/env";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { topUpAllActiveRecurrenceInstances } from "@/features/tasks/recurrence/api";
import type { Profile } from "@/types/domain";

interface AuthProviderProps {
  children: ReactNode;
}

function resolveBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Owns the session subscription. Must sit *inside* `QueryClientProvider`
 * (`AuthProvider` calls `queryClient.clear()` on sign-out/account switch).
 *
 * Inside the `onAuthStateChange` callback: only `setState` +
 * `queryClient.clear()` plus a deferred (queueMicrotask) recurrence top-up
 * on `SIGNED_IN`. Never call Supabase methods synchronously there — the
 * client holds a lock during the callback and re-entering it deadlocks;
 * the top-up runs after the lock is released and never blocks render.
 * Initial loading (code exchange + `getSession`) happens in the effect
 * body, not the callback. Profile/preferences loading belongs to a
 * separate `useEffect` keyed by `user.id` (unit 5), never to this callback.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Without Supabase config the client throws on any access: render the
    // anonymous state instead of crashing (banner explains the setup).
    // One-shot init guard, not a render cascade — hence the rule exception.
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialized(true);
      return;
    }

    let cancelled = false;
    // Last seen user id; `undefined` = nothing seen yet. SIGNED_OUT and
    // account switches clear the query cache; the very first emission only
    // initializes and must not wipe prefetched results.
    let lastUserId: string | null | undefined;

    const applySession = (next: Session | null): void => {
      const nextUserId = next?.user.id ?? null;

      if (lastUserId !== undefined && lastUserId !== nextUserId) {
        queryClient.clear();
      }
      lastUserId = nextUserId;

      if (!cancelled) {
        setSession(next);
        setInitialized(true);
      }
    };

    const init = async (): Promise<void> => {
      try {
        // PKCE `?code=` links (recovery/OAuth): exchange once, then read the
        // session. Exchange failures (stale code) must not block getSession.
        await exchangeCodeFromUrl().catch(() => null);
        // An auth event may have fired while the async init was in flight;
        // its result is fresher than getSession(), so ignore the stale init.
        if (lastUserId !== undefined) {
          return;
        }
        const initial = await getSession();
        if (lastUserId !== undefined) {
          return;
        }
        applySession(initial);
      } catch {
        if (lastUserId === undefined) {
          applySession(null);
        }
      }
    };

    void init();

    let unsubscribe: () => void;
    try {
      ({ unsubscribe } = onAuthStateChange((event, next) => {
        applySession(next);

        // Recurrence top-up on sign-in (plan.md Unit 7): refresh every active
        // rule for 30 days ahead. Deferred past the auth callback so the
        // Supabase client lock is released; never blocks render; failures
        // are logged, never crash the app. Idempotent via
        // read-then-insert pre-filter plus unique-violation tolerance.
        // Time zone comes from the cached profile (`profileQueryKey`,
        // populated by `getProfile` in settings/tasks); while the profile
        // is not loaded yet, fall back to the browser zone (same default
        // as OnboardingDialog) so "today" is never UTC-shifted.
        if (event === "SIGNED_IN" && next?.user) {
          queueMicrotask(() => {
            void (async () => {
              let timeZone: string | undefined;
              try {
                const cached =
                  queryClient.getQueryData<Profile>(profileQueryKey);
                if (cached?.timezone) {
                  timeZone = cached.timezone;
                } else {
                  const fetched = await getProfile().catch(() => null);
                  if (fetched?.timezone) {
                    queryClient.setQueryData(profileQueryKey, fetched);
                    timeZone = fetched.timezone;
                  }
                }
              } catch {
                // Fall through to the browser zone below.
              }
              try {
                await topUpAllActiveRecurrenceInstances({
                  timeZone: timeZone ?? resolveBrowserTimeZone(),
                });
              } catch (error: unknown) {
                console.warn("[recurrence] top-up after sign-in failed", error);
              }
            })();
          });
        }
      }));
    } catch {
      if (!cancelled) {
        setInitialized(true);
      }
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: !initialized ? "loading" : session ? "authenticated" : "anonymous",
      user: session?.user ?? null,
      session,
    }),
    [initialized, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
