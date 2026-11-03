import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/useAuth";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { isSupabaseConfigured } from "@/lib/env";
import type { ProfileTheme } from "@/types/domain";

export const THEME_STORAGE_KEY = "lifeos-theme";

/** Applies the theme to `<html>` and caches it for the pre-bundle script. */
export function applyTheme(theme: ProfileTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / disabled storage: the DB stays the source of truth.
  }
}

export function getStoredTheme(): ProfileTheme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Keeps `<html>` in sync with `profiles.theme` (source of truth).
 * Anonymous / unconfigured states fall back to the cached value so the
 * inline script in `index.html` and React never disagree for long.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled: status === "authenticated" && isSupabaseConfigured,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (profileQuery.data) {
      applyTheme(profileQuery.data.theme);
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (status === "anonymous") {
      const stored = getStoredTheme();
      if (stored) {
        applyTheme(stored);
      }
    }
  }, [status]);

  return <>{children}</>;
}
