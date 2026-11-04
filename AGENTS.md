# AGENTS.md — LifeOS

Instructions for AI coding agents working in this repository. Read this file before any task.
The product specification in [docs/PRD.md](docs/PRD.md) is the source of truth. If code and PRD
disagree, stop and ask — do not "fix" the PRD silently.

## 0. WHAT / WHY / HOW

**WHAT** — SPA на React 19 + TypeScript (strict) + Vite 8 + Tailwind 4; Supabase (Postgres, Auth, RLS,
Edge Functions); тесты Vitest + Playwright; деплой frontend на Vercel.

**WHY** — LifeOS превращает намерения в последовательные действия: цели → этапы → задачи → дневной
план → прогресс → адаптация плана. AI предлагает, решение принимает человек.

**HOW** — `npm run dev` / `build` / `lint` / `test`; разработка по PRD; изменения схемы только через
`supabase/migrations`; перед словом «готово» — verification gate.

Рабочие артефакты: `docs/plan.md` (текущая итерация), `docs/progress.md` (журнал), `docs/prompts.md`
(шаблоны промптов), `docs/vibe-coding-cheatsheet.md` (методика), `.opencode/agents/` (субагенты).

## 1. What we are building

LifeOS is a personal productivity platform: long-term goals, tasks, a planner, habits, analytics and
an AI assistant that only ever proposes changes. The interface language is English; the codebase must
stay localization-ready (no hardcoded user-facing strings inside deep components without a plan for
translation).

Success is not "many features". Success is a user who keeps returning because the system helps them
move toward their own goals.

## 2. Stack (do not swap casually)

- React 19 + TypeScript 5.9 (strict), Vite 8
- Tailwind CSS 4 via `@tailwindcss/vite` (CSS-first config in `src/index.css`)
- React Router 7 (data router), TanStack Query 5, React Hook Form, Zod 4, Recharts, Lucide
- Supabase (Postgres, Auth, RLS, Edge Functions), deployed frontend on Vercel
- Vitest + React Testing Library (unit), Playwright (e2e), ESLint 9+/10 flat config, Prettier

New dependencies require a justification in the task summary. Do not install libraries "just in case".

## 3. Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b
npm run lint       # eslint .
npm test           # vitest run
npm run test:e2e   # playwright (requires npx playwright install)
```

A task is not done while `npm run build`, `npm run lint` or `npm test` fail.

## 4. Architecture rules

```
src/app          composition root: router, providers, navigation
src/components   ui/ primitives and layout/ shells only
src/features     one folder per product module (dashboard, goals, tasks, planner, ...)
src/lib          framework-free helpers (dates, progress, env, supabase client)
src/types        domain types and constant unions that mirror the database
```

- Business logic never lives inside JSX. Pure calculations go to `src/lib`, data access to services.
- Server state is owned by TanStack Query; local state only for genuinely local UI concerns.
- Every entity type has a single definition in `src/types/domain.ts`; do not redeclare shapes.
- All dates: store UTC / ISO, convert for display with the user's IANA time zone (`src/lib/dates.ts`).
- User-facing text must be meaningful; empty screens must explain what to do next (PRD §9.4).

## 5. Security invariants (non-negotiable)

- No `service_role` key, AI API key or any secret in frontend code, git, or `VITE_*` variables.
- Every user table has RLS enabled: `user_id = auth.uid()` (profiles: `id = auth.uid()`).
- Never trust a `user_id` sent by the client; derive identity from the verified JWT.
- AI never touches the database directly. It calls a fixed tool layer and returns proposals.
- No destructive AI action (delete, reschedule, deadline change) without explicit human approval.
- Never weaken RLS, never add `security definer` helpers without review.

## 6. Database rules

- Schema changes only through SQL migrations (`supabase/migrations/NNNN_name.sql`), never ad hoc.
- Keep `CHECK` constraints for statuses, priorities and positive durations; reject inverted intervals.
- Index `user_id` plus frequently filtered columns. Cascade deletes only where genuinely safe.
- Update `src/types/domain.ts` in the same change as the migration.

## 7. Working method

1. Inspect the current code and the relevant PRD sections before writing anything.
2. State a short plan and the files you will touch.
3. Implement the smallest change that fully satisfies the task.
4. Run typecheck, lint, unit tests; add tests for calculations, access rules and edge cases.
5. Report exactly what changed, what was verified, and what remains.
6. Before calling a UI migration finished, grep `src/` for leftovers
   (`rounded-lg|rounded-xl|text-xs|text-sm|min-h-screen|text-red-|text-green-|transition-all`) —
   a "done" step that skips this grep leaves stragglers (found in `AuthLayout` and `router.tsx`
   after two "finished" steps).

Never: rewrite the project for a small change, delete working functionality, invent mock data in
production paths, leave dead buttons, or claim something works without running it.

## 8. Available skills

Global skills live in `~/.config/opencode/skills`, project skills in `.opencode/skills`
and `.agents/skills`. Use the ones that match the task:

- `vercel-react-best-practices`, `vercel-composition-patterns` — React implementation and structure
- `supabase`, `supabase-postgres-best-practices` — auth, RLS, schema, migrations, performance
- `test-driven-development`, `systematic-debugging`, `verification-before-completion` — correctness
- `brainstorming`, `writing-plans`, `to-spec`, `to-tickets` — shaping work before code
- `deploy-to-vercel`, `writing-guidelines` — deployment and copy
- `lifeos-workflow` (`.opencode/skills`) — the project-specific task loop

**Design skills** live in `.agents/skills` (installed with
`npx skills add jakubkrehel/skills --skill <names> -a opencode -y --copy`, tracked by
`skills-lock.json`). Each folder has `SKILL.md` plus reference files. Any UI work starts by
reading the matching files and ends by naming them in the report with the concrete rules applied:

- `better-interface` — ranked review of a screen/flow (a11y, layout, writing, type, color, polish)
- `better-colors` — palettes, semantic tokens, format conversion, contrast measurement
- `better-typography` — type scale, spacing, wrapping, truncation, tabular numbers, punctuation
- `better-layout` — grouping, alignment, reading order, breakpoints, room for translations
- `better-ui` — radius/shadow/optical-alignment/icon-state/motion values
- `better-accessibility` — focus, ARIA, accessible names, forms, WCAG 2.2, reduced motion
- `better-writing` — labels, errors, empty states, confirmations, product voice
- `interface-review` — review a branch/PR for interface problems it introduced

Do not install skills "just in case" and do not cite a skill you did not open.

Subagents for this repo live in `.opencode/agents/` and are invoked with `@`:
`planner`, `frontend-developer`, `code-reviewer`, `debugger`, `security-auditor`.

## 9. Current state

Phase 1 foundation is in place: shell, routing, design tokens, domain types, `dates`/`progress`
helpers with tests. Supabase auth, profile and preferences are **not** implemented yet; the app shows
a setup banner instead of failing. Keep module placeholders honest — they describe a phase, they do
not pretend to be functionality.

The current iteration is written down in `docs/plan.md`; finished work goes to `docs/progress.md`.

## 10. Session hygiene (from the vibe-coding method)

- One task = one session. Start clean instead of dragging a long, polluted context.
- Stay inside roughly 30% of the context window; summarise findings into files, not memory.
- Commit before each prompt so any change is instantly revertible; use a feature branch for experiments.
- With 2+ parallel agents in the same repo use `git worktree`, not the same working copy.
- Disable MCP servers you are not using for the current task; they consume context.
- Quote the specific file section instead of dumping whole files; prefer error text and stack traces
  over screenshots.
- After fixing a recurring mistake, add one line to §7 or §5 so the next session cannot repeat it.
