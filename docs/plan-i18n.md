# Plan — EN/RU i18n + instant language/theme (branch `feat/i18n-preferences`)

Own worktree: `C:\Users\user\Desktop\LifeOs-i18n` (branch `feat/i18n-preferences` from `3007585`).
Do not touch `habits/**`, `analytics/**`, `supabase/migrations/*`, `docs/plan.md`, `docs/progress.md`, `docs/ROADMAP*`.
Do not merge/rebase/cherry-pick into the busy branch, no push/deploy. Shared UI files changed narrowly; conflicts listed in `docs/progress-i18n.md`.

## 0. Cause

- `language` is only written to `profiles`; no translation layer.
- `theme` applies in `ProfileForm.onSubmit`; its `key` depends on `language/theme` and on autosave can wipe the typed name.

## 1. Result (acceptance)

1. Reactive EN/RU: choosing Русский translates current screen + navigation instantly, no reload. Translated: shared components, shell, sign-in/onboarding/settings, Dashboard, Goals, Tasks, Planner, Assistant: forms, dialogs, errors, loading/empty/success, statuses, aria-label. User content + model answers NOT translated.
2. Single typed translation mechanism. No new library (justification §2). Stable keys (property access on a typed `Messages` object, never DOM/English comparison). Open errors/dialogs react (they read from context each render; validation re-validates on locale change only when errors already visible). `Intl` with `ru-RU`/`en-US`, Russian plural categories 1/2/5/11/21 via `Intl.PluralRules`; `html lang` synced. ISO/UTC, timezone, DB enums untouched. English kept. `ky` preserved in types/API but UI marks it unavailable with EN fallback.
3. Language/theme apply instantly, persist locally + background `PATCH profiles` with **only the changed field**. Name + day setup keep separate Save buttons. Switching language/theme never submits those forms, never wipes drafts, never steals focus (stable keys, no remount).
4. Handles ru→en→ru, independent theme change, out-of-order responses, refetch. Last choice wins, also in DB after reload. Stale responses never overwrite newer choice or other profile fields. On failure keep device choice, show «not saved in account» + Retry, never false Saved. Queries/cache cleared on account switch (existing `AuthProvider.clear()` + per-user storage guard). Initial theme without flash (inline script in `index.html`); broken `localStorage` never crashes.
5. Verification: unit/RTL (apply without submit, partial payload, name draft, races, failure/retry, reload/init, account switch, plural, key completeness). Playwright EN↔RU + theme/reload if env allows (no shared-account live writes). `typecheck`, `lint`, `npm test`, `build`, `git diff --check`, UI-leftovers grep. Browser RU mobile/desktop + both themes; unverified marked as such. Mocks never called live DB.

## 2. Design

- **No i18n library.** `react-i18next`/`lingui` add bundle, async loading, and key-extraction tooling for no gain here: ~200 static strings, two locales, no code-splitting need. A typed `Messages` object + context gives compile-time key completeness, instant sync updates, and zero deps. (AGENTS §2: no casual deps.)
- `src/lib/i18n/`:
  - `types.ts`: `Locale = "en" | "ru"`, `IntlLocale = "en-US" | "ru-RU"`, `Messages` (typeof en).
  - `dictionaries/en.ts`, `ru.ts`: nested sections (`common`, `nav`, `layout`, `auth`, `settings`, `dashboard`, `goals`, `tasks`, `planner`, `assistant`, `misc`, `validation`, `enums`).
  - `format.ts`: `tmpl(str, vars)`, `pluralCategory(locale, n)`, `formatCount(...)`, `LOCALE_TO_INTL`, `resolveLocale(profileLang, deviceLang)` (ky → en + `isKyFallback`).
  - `storage.ts`: safe `localStorage` JSON `{value, userId, updatedAt}` + legacy plain-string read; `try/catch` everywhere.
  - `I18nContext.tsx`: `LocaleProvider`, `useLocale()`, `useMessages()`, `useIntlLocale()`. Sets `document.documentElement.lang`. Falls back to `en` when no provider (tests).
  - `index.ts`: public API + `I18N_API.md` pointer.
- `src/app/theme.tsx` + new `src/app/locale.tsx`: per-field serialized sync (`useSyncedPreference`). Serialize per field (save queue, not parallel) so last wins regardless of network order; version + `desired` ref; `setQueryData` merge (no `clear()`, no full invalidate); per-user storage guard; `syncStatus: idle|saving|saved|error` + `retry()`.
- `src/app/providers.tsx`: `Auth > Locale > Theme` (both need session + profile query).
- `index.html`: inline script reads both keys (JSON or legacy), sets `dark` class + `lang` before paint.
- `SettingsPage`: `ProfileNameForm` (fullName only) + `InstantControls` (language/theme selects, instant, status + Retry, ky disabled + notice). Stable `key`s (no language/theme in key). `updateProfile({fullName})` vs `updateProfile({language})` vs `updateProfile({theme})` — never together.
- Validation: schema factories `createXSchema(v: ValidationMessages)`; static English exports kept for unit tests; forms use localized factory + `useRevalidateOnLocaleChange(trigger, errors)` (re-validate only when errors already shown, so open errors change language without resubmit and untouched forms stay clean).
- Enums (`status`, `priority`, `category`, `blockType`, weekdays): translated via `enums` dict + `humanize` replaced by `translateEnum`. DB values untouched.
- Dates: pass `intlLocale` into `formatLongDate` and display `Intl.DateTimeFormat`; internal `zonedParts` stays `en-US` (numeric parts only).

## 3. Files to touch (narrow)

- New: `src/lib/i18n/*` (6 files + 3 tests), `src/app/locale.tsx`, `src/features/settings/useInstantPreferences.ts` (or `src/lib/preferences/sync.ts`), `docs/plan-i18n.md`, `docs/progress-i18n.md`, `e2e/i18n.spec.ts` (mocked, no shared account).
- Edit: `index.html` (inline script), `src/app/providers.tsx`, `src/app/theme.tsx`, `src/app/navigation.ts` (labels → keys), `src/components/layout/*`, `src/components/ui/ProgressBar.tsx`, `src/features/auth/*`, `src/features/settings/*`, `src/features/dashboard/*`, `src/features/goals/**/*` (except habits), `src/features/tasks/**/*`, `src/features/planner/*`, `src/features/assistant/*`, `src/features/misc/NotFoundPage.tsx`, `src/app/RouteErrorPage.tsx`, `src/app/router.tsx` (loading string), `src/lib/dates.ts` (locale param already there; update call sites), `src/lib/strings.ts` (keep `humanize` for non-UI? replace UI uses).
- Never: `src/features/habits/**`, `src/features/analytics/**`, `supabase/migrations/*`, `docs/plan.md`, `docs/progress.md`.

## 4. Tests

- `src/lib/i18n/dictionaries.test.ts`: en/ru key completeness (recursive), no empty strings, `tmpl` interpolation, `pluralCategory` for 1/2/5/11/21/111/112 + EN.
- `src/lib/i18n/storage.test.ts`: JSON + legacy read, broken localStorage no-throw, per-user guard.
- `src/lib/i18n/context.test.tsx`: provider switch updates all consumers instantly, `html lang` sync, fallback en without provider.
- `src/features/settings/instantPreferences.test.tsx`: apply without submit (no `updateProfile` for name/timezone), partial payload `{language}` only / `{theme}` only, name draft preserved (stable input value + focus), ru→en→ru last-wins with out-of-order mocked delays, independent theme change, refetch doesn't overwrite override, failure keeps device + shows not-saved + Retry succeeds, reload init (storage same user wins, different user server wins), account switch clears.
- Existing suites updated: `SettingsPage.test.tsx`, `PreferencesForm`/`AvailabilityForm`/`OnboardingDialog` tests (wrap with providers, assert RU strings), auth/dashboard/goals/tasks/planner/assistant tests (default EN still passes; add RU spot checks).
- Playwright `e2e/i18n.spec.ts`: EN↔RU toggle, theme persist after reload (uses isolated test account or mocked Supabase? never shared prod account concurrently with Phase 5).

## 5. Steps (small commits)

1. docs (`plan-i18n`, `progress-i18n` skeleton) ✅ this file.
2. i18n infra (types/format/storage/context + tests) — TDD.
3. locale/theme sync hook + providers + index.html — TDD.
4. Settings split + instant controls — TDD.
5. nav/shell/layout + auth — batch.
6. dashboard — batch.
7. goals — batch.
8. tasks — batch.
9. planner — batch.
10. assistant + misc/RouteError — batch.
11. e2e + verification gate + integration notes.

## 6. Integration after Phase 5

- `habits/**`, `analytics/**` remain English; translate after Phase 5 using `docs/progress-i18n.md` § «How to translate Phase 5» + public API (`useMessages`, `useLocale`, `tmpl`, plural helpers).
- Conflicts to resolve then: `src/app/navigation.ts` (new Phase 5 entries), shared `ui/*` (if Phase 5 touched), `SettingsPage` (if Phase 5 added prefs).
