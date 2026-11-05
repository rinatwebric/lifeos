import type { ProfileLanguage } from "@/types/domain";

export type Locale = "en" | "ru";

export type IntlLocale = "en-US" | "ru-RU";

/** UI-resolved locale + whether the profile value fell back (ky → en). */
export interface ResolvedLocale {
  locale: Locale;
  isKyFallback: boolean;
}

/**
 * Profile `ky` stays a valid stored value (compat) but the UI has no Kyrgyz
 * strings yet: fall back to English and let the caller show a notice.
 * Unknown/legacy values also fall back to English.
 */
export function resolveLocale(profileLanguage: ProfileLanguage | null | undefined): ResolvedLocale {
  if (profileLanguage === "ru") {
    return { locale: "ru", isKyFallback: false };
  }

  if (profileLanguage === "ky") {
    return { locale: "en", isKyFallback: true };
  }

  return { locale: "en", isKyFallback: false };
}
