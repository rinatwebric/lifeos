import { Languages, Moon, Sun } from "lucide-react";

import { useTheme } from "@/app/theme";
import { cn } from "@/lib/cn";
import { useLanguageSync, useMessages } from "@/lib/i18n/I18nContext";

interface DisplayControlsProps {
  /** Tiles for the Settings card; compact pills for the sidebar footer. */
  variant?: "tiles" | "compact";
}

/**
 * Theme and language are one-click controls, not settings. The visible label
 * is the current value; the accessible name is the action, so the same button
 * works with a pointer, keyboard or a screen reader.
 */
export function DisplayControls({ variant = "tiles" }: DisplayControlsProps) {
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

  const tileClass = cn(
    "group relative flex min-h-[108px] min-w-0 flex-col items-start justify-between gap-4 rounded-control bg-surface-muted p-3.5 text-left transition-[background-color,scale] duration-fast ease-standard",
    "hover:bg-surface-raised motion-safe:active:scale-[0.985]",
  );

  return (
    <div role="group" aria-label={t.displayLabel}>
      {variant === "compact" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="theme-toggle"
            onClick={() => setTheme(nextTheme)}
            aria-label={themeAction}
            title={themeAction}
            className="relative flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-pill bg-surface-muted px-2 text-caption text-muted transition-[color,background-color] duration-fast ease-standard hover:bg-surface-raised hover:text-content"
          >
            {theme === "dark" ? (
              <Moon className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Sun className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{themeLabel}</span>
            {themeStatus === "error" ? (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger"
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
            className="relative flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-pill bg-surface-muted px-2 text-caption text-muted transition-[color,background-color] duration-fast ease-standard hover:bg-surface-raised hover:text-content"
          >
            <Languages className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{languageLabel}</span>
            {langStatus === "error" ? (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger"
                title={langError ?? undefined}
              />
            ) : null}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="theme-toggle"
            onClick={() => setTheme(nextTheme)}
            aria-label={themeAction}
            title={themeAction}
            className={tileClass}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-surface text-muted transition-colors group-hover:text-content">
              {theme === "dark" ? (
                <Moon className="size-4" aria-hidden="true" />
              ) : (
                <Sun className="size-4" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-micro text-muted">{t.themeLabel}</span>
              <span className="mt-0.5 block truncate text-ui font-medium text-content">
                {themeLabel}
              </span>
            </span>
            {themeStatus === "error" ? (
              <span
                aria-hidden="true"
                className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-danger"
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
            className={tileClass}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-surface text-muted transition-colors group-hover:text-content">
              <Languages className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-micro text-muted">{t.languageLabel}</span>
              <span className="mt-0.5 block truncate text-ui font-medium text-content">
                {languageLabel}
              </span>
            </span>
            {langStatus === "error" ? (
              <span
                aria-hidden="true"
                className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-danger"
                title={langError ?? undefined}
              />
            ) : null}
          </button>
        </div>
      )}

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
