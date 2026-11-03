import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { exchangeCodeFromUrl, getSession, onAuthStateChange } from "./api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: Session["user"] | null;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}

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
        applySession(await getSession());
      } catch {
        applySession(null);
      }
    };

    void init();

    const { unsubscribe } = onAuthStateChange((_event, next) => applySession(next));

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
