import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/app/theme";
import { cn } from "@/lib/cn";
import { useLanguageSync, useMessages } from "@/lib/i18n/I18nContext";

/**
 * Theme and language are one-click controls, not settings. The visible label
 * is the current value; the accessible name is the action, so the same button
 * works with a pointer, keyboard or a screen reader.
 */
export function DisplayControls() {
  const m = useMessages();
  const t = m.settings;
  const {
    theme,
    setTheme,
    syncStatus: themeStatus,
    syncError: themeError,
    retrySync: retryTheme,
  } = useTheme();
  const {
    locale,
    setLocale,
    syncStatus: langStatus,
    syncError: langError,
    retrySync: retryLang,
    isKyFallback,
  } = useLanguageSync();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLocale = locale === "ru" ? "en" : "ru";
  const themeAction = nextTheme === "dark" ? t.themeToDark : t.themeToLight;
  const languageAction = nextLocale === "ru" ? t.languageToRussian : t.languageToEnglish;
  const themeLabel = theme === "dark" ? t.themeDark : t.themeLight;
  const languageLabel = isKyFallback ? "KY" : locale === "ru" ? "RU" : "EN";

  const buttonClass = cn(
    "relative inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-2.5 text-ui text-muted transition-[color,background-color] duration-fast ease-standard",
    "hover:bg-surface-muted hover:text-content",
    "justify-start text-left",
  );

  return (
    <div role="group" aria-label={t.displayLabel} className="px-1 pb-2">
      <div className="flex w-full items-center justify-between gap-1">
        <button
          type="button"
          data-testid="theme-toggle"
          onClick={() => setTheme(nextTheme)}
          aria-label={themeAction}
          title={themeAction}
          className={cn(buttonClass, "flex-1")}
        >
          {theme === "dark" ? (
            <Moon className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Sun className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{themeLabel}</span>
          {themeStatus === "error" ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-danger"
              title={themeError ?? undefined}
            />
          ) : null}
        </button>

        <button
          type="button"
          data-testid="language-toggle"
          onClick={() => setLocale(nextLocale)}
          aria-label={languageAction}
          title={languageAction}
          className={cn(buttonClass, "min-w-10 px-3 text-micro font-medium")}
        >
          {languageLabel}
          {langStatus === "error" ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-danger"
              title={langError ?? undefined}
            />
          ) : null}
        </button>
      </div>

      {isKyFallback ? (
        <p className="mt-1 px-2 text-micro text-muted">{t.languageUnavailable}</p>
      ) : null}

      {langStatus === "error" ? (
        <p role="alert" data-testid="language-sync-error" className="mt-1 text-micro text-danger">
          {m.common.notSavedInAccount}{" "}
          <button
            type="button"
            onClick={retryLang}
            className="font-medium underline underline-offset-2"
          >
            {m.common.retrySync}
          </button>
        </p>
      ) : null}

      {themeStatus === "error" ? (
        <p role="alert" data-testid="theme-sync-error" className="mt-1 text-micro text-danger">
          {m.common.notSavedInAccount}{" "}
          <button
            type="button"
            onClick={retryTheme}
            className="font-medium underline underline-offset-2"
          >
            {m.common.retrySync}
          </button>
        </p>
      ) : null}

      {langStatus === "saved" ? (
        <span role="status" data-testid="language-sync-saved" className="sr-only">
          {m.common.saved}
        </span>
      ) : null}
      {themeStatus === "saved" ? (
        <span role="status" data-testid="theme-sync-saved" className="sr-only">
          {m.common.saved}
        </span>
      ) : null}
      {themeError ? <span className="sr-only">{themeError}</span> : null}
    </div>
  );
}
