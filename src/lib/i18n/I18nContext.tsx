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

function readDeviceEntry(): { value: Locale; userId: string | null } | null {
  const stored = readStoredPreference(LANGUAGE_STORAGE_KEY, isLocaleValue);
  return stored ? { value: stored.value, userId: stored.userId } : null;
}

/**
 * Owns the UI language. Priority:
 * session override → device storage (same user) → server profile → English.
 * `ky` profiles fall back to English with `isKyFallback` (value preserved).
 *
 * Explicit choices apply instantly (context + `html lang` + device storage)
 * and sync in the background with `PATCH profiles {language}` — a single
 * field. An effect-driven queue sends one request at a time, so ru→en→ru
 * always ends on the last choice; stale responses are ignored.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [override, setOverrideState] = useState<Locale | null>(null);
  const [deviceLocale, setDeviceLocale] = useState<Locale | null>(
    () => readDeviceEntry()?.value ?? null,
  );
  const [pending, setPending] = useState<Locale | null>(null);
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

  // Account switch: session state belongs to the previous user. Cache is
  // cleared by AuthProvider; the device copy is re-read for the new user.
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

  // Same-user device-first after reload; first run for a user adopts the
  // server so another account's device copy never overwrites this profile.
  useEffect(() => {
    if (!canSync || !profileQuery.data || !userId) return;
    if (override !== null || pending !== null || sendingRef.current) return;

    const entry = readDeviceEntry();

    if (entry && entry.userId === userId && (entry.value === "en" || entry.value === "ru")) {
      if (profileQuery.data.language !== entry.value) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPending(entry.value);
      }
    } else if (!entry || entry.userId !== userId) {
      const server = profileQuery.data.language;
      if (server === "en" || server === "ru") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDeviceLocale(server);
        writeStoredPreference(LANGUAGE_STORAGE_KEY, server, userId);
      }
    }
  }, [canSync, profileQuery.data, userId, override, pending]);

  // Effect-driven queue: one PATCH at a time; a newer choice queued mid-flight
  // triggers a follow-up send, so the last choice always wins. `retryKey`
  // re-runs the send after a failure without changing the queued value.
  useEffect(() => {
    if (!pending || sendingRef.current) return;
    if (!canSync || !userId) return;

    const sent = pending;
    const sendUserId = userId;
    sendingRef.current = true;

    void updateProfile({ language: sent })
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
        // Keep `pending` so Retry re-sends the same choice.
        setSyncError(error instanceof Error && error.message ? error.message : "Please try again.");
      });
  }, [pending, canSync, userId, queryClient, retryKey]);

  const setLocale = useCallback(
    (next: Locale) => {
      setOverrideState(next);
      setDeviceLocale(next);
      writeStoredPreference(LANGUAGE_STORAGE_KEY, next, userIdRef.current);
      setSaved(false);
      setSyncError(null);

      if (!userIdRef.current) {
        setPending(null);
        return;
      }

      setPending(next);
    },
    [],
  );

  const retrySync = useCallback(() => {
    setSyncError(null);
    setPending((current) => {
      if (current !== null) return current;
      const entry = readDeviceEntry();
      return entry && entry.userId === userIdRef.current ? entry.value : null;
    });
    setRetryKey((k) => k + 1);
  }, []);

  const locale: Locale = override ?? deviceLocale ?? serverLocale ?? "en";

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      // Non-DOM test env: ignore.
    }
  }, [locale]);

  const syncStatus: PreferenceSyncStatus = !canSync
    ? "idle"
    : syncError !== null
      ? "error"
      : pending !== null
        ? "saving"
        : saved
          ? "saved"
          : "idle";

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      intlLocale: LOCALE_TO_INTL[locale],
      messages: DICTIONARIES[locale],
      isKyFallback,
      setLocale,
      syncStatus,
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
