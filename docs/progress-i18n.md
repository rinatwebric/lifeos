# Progress — i18n EN/RU (branch `feat/i18n-preferences`)

Worktree: `C:\Users\user\Desktop\LifeOs-i18n`. Base: `3007585`.
This file is the journal for the i18n track. Do not write here from Phase 5; general `docs/plan.md` / `docs/progress.md` untouched.

## Log

- 2026-11-05: branch `feat/i18n-preferences` + worktree `C:\Users\user\Desktop\LifeOs-i18n` created from `3007585` (HEAD). Main dir left untouched (Phase 5 agent active, dirty `habits/*` files not touched).
- 2026-11-05: inventory of EN strings in scope completed. Design: custom typed dictionaries, no new library.
- 2026-11-05: infra committed (`dc63476`): `src/lib/i18n` (types/format/storage/context/sync + tests), `src/app/theme.tsx` race-safe sync, `providers.tsx` (Auth > Locale > Theme), `index.html` inline script (JSON + legacy, lang + theme before paint).
- 2026-11-05: shell/nav/auth committed (`e6e3588`): translated nav (hooks), layout, Brand/MobileHeader/SetupBanner, ProgressBar defaults, RouteError/NotFound/router loading, RequireAuth, all auth pages (code-state errors re-translate open errors), `translateAuthError`/`translateDbError` helpers.
- 2026-11-05: settings committed (`9978bd1`): `SettingsPage` split — `ProfileNameForm` (`{fullName}` only, own Save) + `InstantPreferences` (language/theme instant, single-field PATCH, status + Retry, ky disabled + notice). Stable keys (account id only). Translated Preferences/Availability/Onboarding forms (dict, COPY exports kept).
- 2026-11-05: dashboard committed (`cfb8d6e`): DashboardPage + ScheduleCard translated, `buildInsights` locale-aware plurals (`Intl.PluralRules` ru 1/2/5/11/21), `formatLongDate`/`formatTaskTime` with `ru-RU`/`en-US`, enums via dict.
- 2026-11-05: goals committed (`5301e3d`): GoalsPage/GoalDetailPage/cards/dialogs/filters/milestones translated; localized zod factories (`createGoalFormSchemas`, `createMilestoneFormSchema`) + `useRevalidateOnLocaleChange` (open validation errors switch language without resubmit).
- 2026-11-05: tasks committed (`2767deb`): TasksPage/rows/dialogs/filters translated, `createTaskFormSchemas` + revalidate, task count plurals (1/2/5/11/21), weekday labels via `enums.weekdayShort`.
- 2026-11-05: planner committed (`ab41acd`): PlannerPage/DayView/WeekView dialogs/preview/accept translated; `plannerWeekLabel`/weekday labels via `Intl` locale; `formatBlockCount` locale templates; `collectBlockWarnings`/`describeBlockError`/`collectPlanSlotWarnings` locale-aware; `buildBlockInput` localized schemas (missing-field + zod messages).
- 2026-11-05: assistant committed (`53f4d7b`): AssistantPage/ChatPanel/ProposalModal/ActionRow translated (code-state errors, decision notices as structured state, action descriptions via dict templates + `Intl` dates).
- 2026-11-05: full gate green (see Verification). `e2e/i18n.spec.ts` added (shared-account mutating; run only when Phase 5 idle — NOT executed here). `e2e/i18n-anon.spec.ts` added (credential-free: RU render, lang/theme init, reload persistence, mobile 375px — zero account impact).
- 2026-11-06: planner generators localized — `explainSlotParts` (stable structured reasons) + `formatSlotReason`/`formatIssueExplanation` (dict templates, EN/RU verified); `PlanPreviewSlot.reasonParts` wired, open preview content re-renders on language switch (RTL proof). Reload/init + account-switch RTL tests for language (4 new) and theme (3 new). Anonymous Playwright suite passes 3/3 on Chromium (incl. mobile viewport, both init states).

## Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (36 pre-existing `react-refresh/only-export-components` warnings on COPY+component files, same pattern as base).
- `npm test` — 86 files / 807 tests pass (incl. `explainSlotParts`, `slotReason` EN/RU, RU preview re-render, language reload/init/account-switch ×4, theme reload/switch ×3).
- `npm run build` — succeeds (pre-existing chunk-size warning only).
- `git diff --check` — clean.
- UI-leftovers grep (`rounded-lg|rounded-xl|text-xs|text-sm|min-h-screen|text-red-|text-green-|transition-all`) — no matches.
- Playwright `e2e/i18n-anon.spec.ts` — 3/3 pass on Chromium (RU sign-in render, `html lang`, dark init, EN→RU reload persistence, 375px mobile, no overflow). Zero shared-account impact (anonymous + own browser profile).
- Playwright `e2e/i18n.spec.ts` (authenticated EN↔RU round-trip + theme persistence) — NOT run: mutates the shared account while the Phase 5 agent is active in `C:\Users\user\Desktop\LifeOs` (dirty `habits/*`, ahead 12); requires idle window + credentials.
- Authenticated RU mobile/desktop in a real browser — unverified here (only Chromium + emulated mobile viewport via the anon suite); marked for the idle-window run.

## Coverage (translated)

- Common/nav/layout/shell, auth (all pages + errors), settings/onboarding/day/availability, dashboard (+insights plurals), goals (+milestones), tasks (+recurrence UI), planner (page, day/week views, block dialog, delete, preview, slot editor, accept, warnings), assistant (page, chat, proposal modal/rows, action descriptions, error codes), misc/RouteError.
- User content (goal/task titles, descriptions, AI message text/summary/reasoning) + model proposal payloads NOT translated (by design).
- DB enums/timezone/ISO untouched; `ky` preserved in types/API, UI falls back to EN with notice.
- Planner slot reasons + issue/already-planned explanations: localized via structured `reasonParts` + reason codes (`formatSlotReason`/`formatIssueExplanation`, EN/RU tested). Raw English `reason`/`explanation` strings are kept as compat fallbacks only.

## Known limitations / follow-ups

1. Zod validation for planner `applyPlanSchema`/`planSlotSchema` + assistant `proposalIdSchema`/`selectedIndexesSchema`: static English (used in edge paths, not the main forms which are localized via factories).
2. Duration units (`formatDurationMinutes` → "1 h 30 min") not localized (RU would be "1 ч 30 мин"). Tests assert current format; changing needs test updates + dict.
3. Anonymous language switcher: instant controls live in Settings (auth). Anonymous users get device/browser default; no UI to switch before sign-in. Consider adding a compact switcher to `AuthLayout` later.
4. Authenticated E2E (`e2e/i18n.spec.ts`) + authenticated RU mobile/desktop matrix still to run in an idle window (Phase 5 agent active now).

## Conflicts for integration after Phase 5

- `src/app/navigation.ts` — Phase 5 may add entries; keep i18n keys, re-add entries with `labelKey` + `useTranslatedNav()`.
- Shared `src/components/ui/*` — i18n changes are narrow (aria/defaults only); re-apply if Phase 5 touched same lines.
- `src/features/settings/*` — if Phase 5 added prefs, keep instant language/theme split.
- `src/features/habits/**`, `src/features/analytics/**` remain English — translate after Phase 5 (see below). No migrations touched. General `docs/plan.md` / `docs/progress.md` / ROADMAP untouched.

## How to translate Phase 5 (habits/analytics) later

- Public API: `src/lib/i18n/index.ts` → `LocaleProvider`, `useLocale(): Locale`, `useIntlLocale(): "en-US"|"ru-RU"`, `useMessages(): Messages`, `tmpl(template, vars)`, `pluralCategory(locale, n)`, `LOCALE_TO_INTL`, `resolveLocale()`, `useRevalidateOnLocaleChange(trigger, hasErrors)`, `translateAuthError`/`translateDbError`/`translateAssistantError` patterns.
- Add keys under `messages.<feature>.*` in `dictionaries/en.ts` + `ru.ts` (same shape; `dictionaries.test.ts` enforces completeness).
- In components: `const m = useMessages(); const intl = useIntlLocale();` — no hardcoded English, no English-phrase comparison; user content + model answers stay untranslated; dates via `formatLongDate(date, tz, intl)` + `Intl.DateTimeFormat(intl, ...)`; enums via `m.enums.*`.
- Validation: add `createXxxSchemas(v: ValidationMessages)` factories + `useRevalidateOnLocaleChange` (see goals/tasks/planner/assistant for the pattern); keep static English exports for existing unit tests.
- Async errors: store codes (`AuthErrorCode`/`DbErrorCode`/`AssistantErrorCode`/`BlockErrorCode`), translate at render via helpers so open errors react to language switch.
