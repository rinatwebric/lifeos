# Progress — i18n EN/RU (branch `feat/i18n-preferences`)

Worktree: `C:\Users\user\Desktop\LifeOs-i18n`. Base: `3007585`.
This file is the journal for the i18n track. Do not write here from Phase 5; general `docs/plan.md` / `docs/progress.md` untouched.

## Log

- 2026-11-05: branch `feat/i18n-preferences` + worktree `C:\Users\user\Desktop\LifeOs-i18n` created from `3007585` (HEAD). Main dir left untouched (Phase 5 agent active, dirty `habits/*` files not touched).
- 2026-11-05: inventory of EN strings in scope completed (see `docs/plan-i18n.md` §2 + subagent report in session). Design fixed: custom typed dictionaries, no new library.

## Verification

- (pending) `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, UI-leftovers grep.
- (pending) Playwright EN↔RU / theme / reload — only if env allows; never against the shared account concurrently with Phase 5.

## Conflicts for integration after Phase 5 (to fill)

- `src/app/navigation.ts` — Phase 5 may add entries; keep i18n keys, re-add entries with `useTranslatedNav`.
- Shared `src/components/ui/*` — i18n changes are narrow (aria/defaults only); re-apply if Phase 5 touched same lines.
- `src/features/settings/*` — if Phase 5 added prefs, keep instant language/theme split.

## How to translate Phase 5 (habits/analytics) later

- Public API: `src/lib/i18n/index.ts` → `LocaleProvider`, `useLocale(): Locale`, `useIntlLocale(): "en-US"|"ru-RU"`, `useMessages(): Messages`, `tmpl(template, vars)`, `pluralCategory(locale, n)`, `LOCALE_TO_INTL`, `resolveLocale()`.
- Add keys under `messages.habits.*` / `messages.analytics.*` in `dictionaries/en.ts` + `ru.ts` (same shape; `dictionaries.test.ts` enforces completeness).
- In components: `const m = useMessages(); const intl = useIntlLocale();` — no hardcoded English, no English-phrase comparison; user content + model answers stay untranslated; DB enums/timezone/ISO untouched; dates via `formatLongDate(date, tz, intl)` + `Intl.DateTimeFormat(intl, ...)`.
- Validation: use `createXSchema(m.validation)` factories + `useRevalidateOnLocaleChange`.
