# Журнал прогресса

Состояние проекта живёт в файлах и Git, а не в памяти модели. Каждая запись — дата, что сделано,
чем проверено, что осталось.

## 2026-11-03 — Phase 1 Foundation + рабочая среда

**Сделано**

- Инициализирован проект: Vite 8, React 19.3, TypeScript 5.9 (strict), Tailwind 4 (`@tailwindcss/vite`),
  React Router 7, TanStack Query 5, Zod 4, Supabase JS, Lucide. ESLint 10 (flat) + Prettier.
- Дизайн-токены light/dark в `src/index.css`, layout с sidebar и мобильной навигацией, 9 роутов,
  честные empty states без mock-данных.
- `src/types/domain.ts`: Goal, Milestone, Task, RecurrenceRule, TimeBlock, Habit, HabitLog, AiProposal
  и union-константы статусов/приоритетов по PRD §11.
- `src/lib/dates.ts`: `toDateKey`, `isTaskOverdue`, `isTaskDueToday` с учётом IANA-пояса.
- `src/lib/progress.ts`: прогресс по этапам (null при отсутствии этапов), clamp, completion rate.
- Тесты: 17 (Vitest + RTL), включая time-zone кейсы (`Asia/Bishkek`, `Europe/Berlin`) и рендер шелла.
- `src/lib/supabase/client.ts`: ленивый клиент; без `.env.local` приложение показывает баннер, а не падает.
- Документация: `docs/PRD.md` (полное ТЗ), `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`,
  `docs/vibe-coding-cheatsheet.md`, `docs/prompts.md`, `docs/plan.md`, `AGENTS.md`, `README.md`.
- Оркестрация: 5 субагентов в `.opencode/agents/`, проектный скил `lifeos-workflow`,
  `opencode.json` с MCP `context7`.
- Глобальные скилы opencode (29 шт.) + `find-skills` и `design-taste-frontend` в `~/.agents/skills`.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — ok
- `npm test` — 17/17
- `npm run build` — ok (436 kB, 135 kB gzip)
- `npm run preview` — HTTP 200 на `http://localhost:4173`
- `npm run format:check` — ok

**Осталось**

- Supabase project + `.env.local` (нужны ключи пользователя).
- Итерация 1.2: миграции `profiles` / `user_preferences`, auth-экраны, защищённые роуты — см. `docs/plan.md`.
- Playwright: `npx playwright install` перед e2e.
