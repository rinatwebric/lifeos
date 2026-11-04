export { en } from "./dictionaries/en";
export { ru } from "./dictionaries/ru";
export { LOCALE_TO_INTL, pluralCategory, tmpl } from "./format";
export type { PluralCategory } from "./format";
export {
  I18nContext,
  LocaleProvider,
  useI18nContext,
  useIntlLocale,
  useLocale,
  useMessages,
} from "./I18nContext";
export type { Messages } from "./I18nContext";
export {
  LANGUAGE_STORAGE_KEY,
  isLocaleValue,
  isThemeValue,
  readStoredPreference,
  writeStoredPreference,
} from "./storage";
export { resolveLocale } from "./types";
export type { IntlLocale, Locale, ResolvedLocale } from "./types";
export { useRevalidateOnLocaleChange } from "./useRevalidate";
