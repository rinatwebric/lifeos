# Editorial UI redesign — plan (feat/editorial-ui)

Worktree: `C:\Users\user\Desktop\LifeOs-design`. Branch `feat/editorial-ui` from `c79779d`.
Do not touch `main`, `LifeOs-i18n`, Phase5 files, migrations, DB, APIs, auth/save semantics.
Own artifacts only: `docs/plan-design.md`, `docs/progress-design.md`, `docs/i18n-catalog-design.md`.

## References
- Images: two attached references are the visual north star (not in repo). Direction: restrained,
  Apple-like; warm near-black + milky text + muted amber; thin dividers; clear spacing.
- Skills read: better-interface, better-colors, better-typography, better-layout, better-ui,
  better-accessibility, better-writing (all in `.agents/skills/*/SKILL.md`).
- PRD §3.2, §9; AGENTS.md §4–§7.

## Rules
- No new dependencies. No second i18n provider. Keep all `*_COPY` keys; new strings go to
  `docs/i18n-catalog-design.md` (EN + RU) and reuse the same key names in code.
- Instant theme/language switch must keep working (`applyTheme`, no new mechanism).
- Habits/Analytics pages: tokens only, no edits.
- Mail is off permanently (owner decision): never promise delivery of any letter.

## Steps (one commit each)
1. Tokens (`src/index.css`): warm dark + warm light themes, keep semantic tier names,
   add `--color-action`/`--color-action-content`, `--font-display` (Georgia/Times/Noto Serif —
   full Cyrillic, no licensed SF), tabular-nums kept, focus stays blue 3:1, muted passes 4.5:1
   (measure, don't copy dim captions blindly). Radius: control 10px, card 16px.
2. Primitives: Button (action primary, secondary, ghost, danger; loading; 44px touch),
   Input/Select/Textarea (44px, border-control 3:1, error wiring kept), Badge (status ≠ action),
   ProgressBar (action fill + static % label), Dialog (native, focus restore kept),
   Card (single-level only), PageHeader (serif title option), EmptyState, Field.
3. Auth: `AuthLayout` two-column (~50/50 desktop, form 400–460px), `AuthVisual` original
   inline SVG (concentric orbits goals→tasks→day + amber arc; `aria-hidden`, reduced-motion
   safe, no gradients/glass abuse), mobile compact intro; SignIn/SignUp copy kept keys +
   honest mail-off note on reset; `DemoSignInButton`: renders disabled honest state when no env
   (update its test); guards/deep links untouched.
4. Shell: Sidebar active = bar + semibold + `aria-current` (not color alone); remove
   `Phase 4 · AI Assistant` label; Settings stays bottom secondary; MobileNav same active
   treatment; MobileHeader unchanged logic.
5. Dashboard: eyebrow date + serif greeting (real `profile.fullName`), one primary action,
   overview (progress / schedule / insights) as hierarchy not 3 equal cards, goals + tasks as
   lists with dividers (remove Card-in-Card), no sample data, all 4 states kept.
6. Visual pass on Goals/Tasks/Planner/Assistant/Settings (spacing, headers, dividers only;
   no action removed, no logic touched). i18n catalog doc. Leftover grep = 0.
7. Verification: typecheck, lint, test, build, `git diff --check`, leftover grep, contrast
   script numbers, browser matrix (or honest Not verified list), reviewer pass, fixes.

## Conflicts / integration notes
- `src/app/theme.tsx` is modified in `LifeOs-i18n` (uncommitted: theme/i18n work). This branch
  does NOT edit `theme.tsx` logic — integration = take i18n branch's file, tokens merge cleanly
  (CSS-only additions here).
- `DemoSignInButton` test changes (null → honest disabled state) must be communicated.
- New COPY keys (auth visual, dashboard eyebrow, reset mail-off note) listed in
  `docs/i18n-catalog-design.md` for the i18n branch to pick up.
