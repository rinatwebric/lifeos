import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { exchangeCodeFromUrl, getSession, onAuthStateChange } from "./api";
import { AuthContext, type AuthContextValue } from "./useAuth";
import { isSupabaseConfigured } from "@/lib/env";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Owns the session subscription. Must sit *inside* `QueryClientProvider`
 * (`AuthProvider` calls `queryClient.clear()` on sign-out/account switch).
 *
 * Inside the `onAuthStateChange` callback: only `setState` +
 * `queryClient.clear()`. Never call Supabase methods there — the client holds
 * a lock during the callback and re-entering it deadlocks. Initial loading
 * (code exchange + `getSession`) happens in the effect body, not the callback.
 * Profile/preferences loading belongs to a separate `useEffect` keyed by
 * `user.id` (unit 5), never to this callback.
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
      ({ unsubscribe } = onAuthStateChange((_event, next) => applySession(next)));
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
