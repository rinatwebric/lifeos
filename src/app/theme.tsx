import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/useAuth";
import { getProfile, profileQueryKey, updateProfile } from "@/features/settings/api";
import { isSupabaseConfigured } from "@/lib/env";
import { isThemeValue, readStoredPreference, writeStoredPreference } from "@/lib/i18n/storage";
import type { ProfileTheme } from "@/types/domain";

export const THEME_STORAGE_KEY = "lifeos-theme";

export type ThemeSyncStatus = "idle" | "saving" | "saved" | "error";

/** Toggles the `dark` class. Storage is owned by `ThemeProvider` (per-user JSON). */
export function applyTheme(theme: ProfileTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Legacy + JSON read. Never throws (private mode safe). */
export function getStoredTheme(): ProfileTheme | null {
  return readStoredPreference(THEME_STORAGE_KEY, isThemeValue)?.value ?? null;
}

interface ThemeContextValue {
  theme: ProfileTheme;
  setTheme: (theme: ProfileTheme) => void;
  syncStatus: ThemeSyncStatus;
  syncError: string | null;
  retrySync: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readDeviceTheme(): ProfileTheme | null {
  return getStoredTheme();
}

/**
 * Owns the UI theme. Priority: session override → device storage (same
 * user) → server profile → stored/initial default (no flash: the inline
 * script in `index.html` already applied the device value).
 *
 * Explicit choices apply instantly (class + storage) and sync with
 * `PATCH profiles {theme}` — a single field. Serialized queue, last wins,
 * stale responses ignored, refetch never overwrites a newer choice.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [override, setOverrideState] = useState<ProfileTheme | null>(null);
  const [deviceTheme, setDeviceTheme] = useState<ProfileTheme | null>(() => readDeviceTheme());
  const [syncStatus, setSyncStatus] = useState<ThemeSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const canSync = status === "authenticated" && isSupabaseConfigured;

  const desiredRef = useRef<ProfileTheme | null>(null);
  const savingRef = useRef(false);
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  useEffect(() => {
    setOverrideState(null);
    setSyncStatus("idle");
    setSyncError(null);
    desiredRef.current = null;
    savingRef.current = false;
    const stored = readStoredPreference(THEME_STORAGE_KEY, isThemeValue);
    setDeviceTheme(stored && stored.userId === userId ? stored.value : null);
  }, [userId]);

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled: canSync,
    staleTime: 60_000,
  });

  const serverTheme: ProfileTheme | null = profileQuery.data?.theme ?? null;

  // Same-user device-first after reload; first run for a user adopts the
  // server so another account's device copy never overwrites this profile.
  useEffect(() => {
    if (!canSync || !profileQuery.data || !userId) return;
    if (override !== null || desiredRef.current !== null || savingRef.current) return;

    const stored = readStoredPreference(THEME_STORAGE_KEY, isThemeValue);

    if (stored && stored.userId === userId && isThemeValue(stored.value)) {
      if (profileQuery.data.theme !== stored.value) {
        desiredRef.current = stored.value;
        setSyncStatus("saving");
        setSyncError(null);
        void flushRef.current?.();
      }
    } else if (!stored || stored.userId !== userId) {
      setDeviceTheme(profileQuery.data.theme);
      writeStoredPreference(THEME_STORAGE_KEY, profileQuery.data.theme, userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, profileQuery.data, userId, override]);

  const flushRef = useRef<(() => void) | null>(null);

  const flush = useCallback(() => {
    const desired = desiredRef.current;
    const currentUserId = userIdRef.current;

    if (!desired || savingRef.current) return;
    if (!currentUserId) {
      desiredRef.current = null;
      return;
    }

    savingRef.current = true;
    setSyncStatus("saving");
    setSyncError(null);

    void updateProfile({ theme: desired })
      .then((updated) => {
        savingRef.current = false;

        if (desiredRef.current !== null && desiredRef.current !== desired) {
          flush();
          return;
        }

        desiredRef.current = null;
        setSyncStatus("saved");
        queryClient.setQueryData(profileQueryKey, updated);
      })
      .catch((error: unknown) => {
        savingRef.current = false;

        if (desiredRef.current !== null && desiredRef.current !== desired) {
          flush();
          return;
        }

        setSyncStatus("error");
        setSyncError(error instanceof Error && error.message ? error.message : "Please try again.");
      });
  }, [queryClient]);

  flushRef.current = flush;

  const setTheme = useCallback(
    (next: ProfileTheme) => {
      setOverrideState(next);
      setDeviceTheme(next);
      applyTheme(next);
      writeStoredPreference(THEME_STORAGE_KEY, next, userIdRef.current);
      desiredRef.current = next;
      setSyncError(null);

      if (!userIdRef.current) {
        desiredRef.current = null;
        setSyncStatus("idle");
        return;
      }

      flush();
    },
    [flush],
  );

  const retrySync = useCallback(() => {
    if (desiredRef.current === null) {
      const stored = readStoredPreference(THEME_STORAGE_KEY, isThemeValue);
      if (stored && stored.userId === userIdRef.current) {
        desiredRef.current = stored.value;
      }
    }

    if (desiredRef.current !== null) flush();
  }, [flush]);

  const theme: ProfileTheme = override ?? deviceTheme ?? serverTheme ?? "light";

  useEffect(() => {
    try {
      applyTheme(theme);
    } catch {
      // Non-DOM test env: ignore.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      syncStatus: canSync ? syncStatus : "idle",
      syncError: canSync ? syncError : null,
      retrySync,
    }),
    [theme, setTheme, syncStatus, syncError, retrySync, canSync],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      theme: "light",
      setTheme: () => {},
      syncStatus: "idle",
      syncError: null,
      retrySync: () => {},
    }
  );
}
