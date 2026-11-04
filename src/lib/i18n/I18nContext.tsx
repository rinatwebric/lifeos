import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { LOCALE_TO_INTL } from "./format";
import { en } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import {
  LANGUAGE_STORAGE_KEY,
  isLocaleValue,
  readStoredPreference,
  writeStoredPreference,
} from "./storage";
import type { IntlLocale, Locale } from "./types";
import { useAuth } from "@/features/auth/useAuth";
import { getProfile, profileQueryKey, updateProfile } from "@/features/settings/api";
import { isSupabaseConfigured } from "@/lib/env";

export type Messages = typeof en;

const DICTIONARIES: Record<Locale, Messages> = { en, ru };

export type PreferenceSyncStatus = "idle" | "saving" | "saved" | "error";

interface I18nContextValue {
  locale: Locale;
  intlLocale: IntlLocale;
  messages: Messages;
  isKyFallback: boolean;
  setLocale: (locale: Locale) => void;
  syncStatus: PreferenceSyncStatus;
  syncError: string | null;
  retrySync: () => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

function readDeviceLocale(): Locale | null {
  return readStoredPreference(LANGUAGE_STORAGE_KEY, isLocaleValue)?.value ?? null;
}

function readDeviceEntry(): { value: Locale; userId: string | null } | null {
  const stored = readStoredPreference(LANGUAGE_STORAGE_KEY, isLocaleValue);
  return stored ? { value: stored.value, userId: stored.userId } : null;
}

/**
 * Owns the UI language. Priority:
 * session override → device storage (same user) → server profile → English.
 * `ky` profiles fall back to English with `isKyFallback` (value preserved).
 *
 * Every explicit choice applies instantly (context + `html lang` + device
 * storage) and syncs in the background with `PATCH profiles {language}` —
 * a single field, never the whole profile. One request at a time (queue),
 * so ru→en→ru always ends on the last choice; stale responses are ignored
 * and a newer choice re-sends after the in-flight one lands.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [override, setOverrideState] = useState<Locale | null>(null);
  const [deviceLocale, setDeviceLocale] = useState<Locale | null>(() => readDeviceLocale());
  const [syncStatus, setSyncStatus] = useState<PreferenceSyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const canSync = status === "authenticated" && isSupabaseConfigured;

  const desiredRef = useRef<Locale | null>(null);
  const savingRef = useRef(false);
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  // Account switch: drop session state. Cache is cleared by AuthProvider.
  useEffect(() => {
    setOverrideState(null);
    setSyncStatus("idle");
    setSyncError(null);
    desiredRef.current = null;
    savingRef.current = false;
    const entry = readDeviceEntry();
    setDeviceLocale(entry && entry.userId === userId ? entry.value : null);
  }, [userId]);

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled: canSync,
    staleTime: 60_000,
  });

  const serverLocale: Locale | null = (() => {
    const lang = profileQuery.data?.language;
    if (lang === "ru") return "ru";
    if (lang === "en") return "en";
    return null;
  })();

  const isKyFallback = profileQuery.data?.language === "ky" && override === null;

  // Device-first for the same user after reload: if the stored copy belongs
  // to this user and differs from the server, it is the newer choice —
  // keep it and push it in the background (also covers failed saves).
  useEffect(() => {
    if (!canSync || !profileQuery.data || !userId) return;
    if (override !== null || desiredRef.current !== null || savingRef.current) return;

    const entry = readDeviceEntry();
    if (entry && entry.userId === userId && (entry.value === "en" || entry.value === "ru")) {
      if (profileQuery.data.language !== entry.value) {
        desiredRef.current = entry.value;
        setSyncStatus("saving");
        setSyncError(null);
        void flushRef.current?.();
      } else {
        setSyncStatus((s) => (s === "idle" ? s : s));
      }
    } else if (!entry || entry.userId !== userId) {
      // First run for this user (or legacy entry): adopt the server value
      // so another account's device copy never overwrites this profile.
      const server = profileQuery.data.language;
      if (server === "en" || server === "ru") {
        setDeviceLocale(server);
        writeStoredPreference(LANGUAGE_STORAGE_KEY, server, userId);
      }
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

    void updateProfile({ language: desired })
      .then((updated) => {
        savingRef.current = false;

        // A newer choice arrived while saving → send it instead of
        // reporting success for a stale value.
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

  const setLocale = useCallback(
    (next: Locale) => {
      setOverrideState(next);
      setDeviceLocale(next);
      writeStoredPreference(LANGUAGE_STORAGE_KEY, next, userIdRef.current);
      desiredRef.current = next;
      setSyncError(null);

      if (!userIdRef.current) {
        // Anonymous / unconfigured: device-only, nothing to sync.
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
      // Re-queue the effective choice (device wins for this user).
      const entry = readDeviceEntry();
      const fallback = entry && entry.userId === userIdRef.current ? entry.value : null;
      if (fallback) desiredRef.current = fallback;
    }

    if (desiredRef.current !== null) flush();
  }, [flush]);

  const locale: Locale = override ?? deviceLocale ?? serverLocale ?? "en";

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      // Non-DOM test env: ignore.
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      intlLocale: LOCALE_TO_INTL[locale],
      messages: DICTIONARIES[locale],
      isKyFallback,
      setLocale,
      syncStatus: canSync ? syncStatus : "idle",
      syncError: canSync ? syncError : null,
      retrySync,
    }),
    [locale, isKyFallback, setLocale, syncStatus, syncError, retrySync, canSync],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Falls back to English outside a provider (unit tests, error boundaries). */
export function useMessages(): Messages {
  return useContext(I18nContext)?.messages ?? en;
}

export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? "en";
}

export function useIntlLocale(): IntlLocale {
  return useContext(I18nContext)?.intlLocale ?? "en-US";
}

export function useLanguageSync(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  syncStatus: PreferenceSyncStatus;
  syncError: string | null;
  retrySync: () => void;
  isKyFallback: boolean;
} {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      syncStatus: "idle",
      syncError: null,
      retrySync: () => {},
      isKyFallback: false,
    };
  }

  return {
    locale: ctx.locale,
    setLocale: ctx.setLocale,
    syncStatus: ctx.syncStatus,
    syncError: ctx.syncError,
    retrySync: ctx.retrySync,
    isKyFallback: ctx.isKyFallback,
  };
}

/** Test/dev escape hatch. */
export function useI18nContext(): I18nContextValue | null {
  return useContext(I18nContext);
}

export { LANGUAGE_STORAGE_KEY };
export type { Locale, IntlLocale };
