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

function readDeviceEntry(): { value: ProfileTheme; userId: string | null } | null {
  const stored = readStoredPreference(THEME_STORAGE_KEY, isThemeValue);
  return stored ? { value: stored.value, userId: stored.userId } : null;
}

/**
 * Owns the UI theme. Priority: session override → device storage (same
 * user) → server profile → light. Explicit choices apply instantly (class +
 * storage) and sync with `PATCH profiles {theme}` — a single field.
 * Effect-driven queue: one request at a time, last choice wins.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [override, setOverrideState] = useState<ProfileTheme | null>(null);
  const [deviceTheme, setDeviceTheme] = useState<ProfileTheme | null>(
    () => readDeviceEntry()?.value ?? null,
  );
  const [pending, setPending] = useState<ProfileTheme | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const sendingRef = useRef(false);

  const userId = user?.id ?? null;
  const canSync = status === "authenticated" && isSupabaseConfigured;

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Account switch: session state belongs to the previous user.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverrideState(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    sendingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncError(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetryKey(0);
    const entry = readDeviceEntry();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceTheme(entry && entry.userId === userId ? entry.value : null);
  }, [userId]);

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled: canSync,
    staleTime: 60_000,
  });

  const serverTheme: ProfileTheme | null = profileQuery.data?.theme ?? null;

  // Same-user device-first after reload; first run adopts the server.
  useEffect(() => {
    if (!canSync || !profileQuery.data || !userId) return;
    if (override !== null || pending !== null || sendingRef.current) return;

    const entry = readDeviceEntry();

    if (entry && entry.userId === userId && isThemeValue(entry.value)) {
      if (profileQuery.data.theme !== entry.value) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPending(entry.value);
      }
    } else if (!entry || entry.userId !== userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeviceTheme(profileQuery.data.theme);
      writeStoredPreference(THEME_STORAGE_KEY, profileQuery.data.theme, userId);
    }
  }, [canSync, profileQuery.data, userId, override, pending]);

  useEffect(() => {
    if (!pending || sendingRef.current) return;
    if (!canSync || !userId) return;

    const sent = pending;
    const sendUserId = userId;
    sendingRef.current = true;

    void updateProfile({ theme: sent })
      .then((updated) => {
        sendingRef.current = false;
        if (userIdRef.current !== sendUserId) return;
        setPending((current) => (current === sent ? null : current));
        if (readDeviceEntry()?.value === sent) {
          setSaved(true);
          queryClient.setQueryData(profileQueryKey, updated);
        }
      })
      .catch((error: unknown) => {
        sendingRef.current = false;
        if (userIdRef.current !== sendUserId) return;
        setSyncError(error instanceof Error && error.message ? error.message : "Please try again.");
      });
  }, [pending, canSync, userId, queryClient, retryKey]);

  const setTheme = useCallback((next: ProfileTheme) => {
    setOverrideState(next);
    setDeviceTheme(next);
    try {
      applyTheme(next);
    } catch {
      // Non-DOM test env: ignore.
    }
    writeStoredPreference(THEME_STORAGE_KEY, next, userIdRef.current);
    setSaved(false);
    setSyncError(null);

    if (!userIdRef.current) {
      setPending(null);
      return;
    }

    setPending(next);
  }, []);

  const retrySync = useCallback(() => {
    setSyncError(null);
    setPending((current) => {
      if (current !== null) return current;
      const entry = readDeviceEntry();
      return entry && entry.userId === userIdRef.current ? entry.value : null;
    });
    setRetryKey((k) => k + 1);
  }, []);

  const theme: ProfileTheme = override ?? deviceTheme ?? serverTheme ?? "light";

  useEffect(() => {
    try {
      applyTheme(theme);
    } catch {
      // Non-DOM test env: ignore.
    }
  }, [theme]);

  const syncStatus: ThemeSyncStatus = !canSync
    ? "idle"
    : syncError !== null
      ? "error"
      : pending !== null
        ? "saving"
        : saved
          ? "saved"
          : "idle";

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      syncStatus,
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
