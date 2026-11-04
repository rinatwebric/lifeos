import type { Locale } from "./types";

export const LOCALE_TO_INTL = { en: "en-US", ru: "ru-RU" } as const;

/** Replaces `{name}` placeholders; unknown keys stay intact. */
export function tmpl(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export type PluralCategory = "one" | "few" | "many" | "other";

/**
 * `Intl.PluralRules` category for the UI locale.
 * Russian needs one/few/many (1/2/5/11/21…); English uses one/other.
 */
export function pluralCategory(locale: Locale, count: number): PluralCategory {
  const intl = LOCALE_TO_INTL[locale] ?? "en-US";
  const category = new Intl.PluralRules(intl).select(count);

  if (category === "one" || category === "few" || category === "many" || category === "other") {
    return category;
  }

  return "other";
}
