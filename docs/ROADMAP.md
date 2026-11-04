# Roadmap LifeOS

Чек-лист отражает фактическое состояние, а не намерения. Порядок и состав этапов — из PRD §17.

## Phase 1 — Foundation ✅

- [x] Vite + React 19 + TypeScript strict
- [x] Tailwind CSS 4 + дизайн-токены (light/dark)
- [x] React Router + layout (sidebar / mobile nav) + адаптивность
- [x] Доменные типы и константы статусов/приоритетов
- [x] `lib/dates` (IANA time zone) и `lib/progress` + unit-тесты
- [x] ESLint flat config, Prettier, Vitest, Playwright config
- [x] `.env.example`, инструкция запуска, AGENTS.md
- [x] Supabase project + `.env.local`
- [x] Регистрация / вход / выход / восстановление пароля (+ подтверждение email, обе ветки по `data.session`)
- [x] Профиль (`profiles`) и `user_preferences` (миграции 0001/0002, RLS, триггер `handle_new_user`)
- [x] Защищённые роуты и редиректы (`RequireAuth`/`RedirectIfAuthed`, onboarding-диалог, Sign out)
- [x] e2e: 6 сценариев live-auth + ручная проверка RLS (`scripts/verify-rls.mjs`)

**Результат:** пользователь регистрируется и входит в LifeOS.

## Phase 2 — Goals & Tasks ✅ (итерация 2 закрыта 2026-11-04)

- [x] Миграции: `goals`, `milestones`, `tasks`, `recurrence_rules` + RLS + CHECK
  (`0003`, `0004` применены; `time_blocks` → Phase 3 — таблице без UI в Phase 2 делать нечего)
- [x] CRUD целей, статусы, архивирование, подтверждение удаления (счётчик отвязываемых задач, `SET NULL`)
- [x] Этапы цели, позиции, пересчёт прогресса (ручной / по этапам)
- [x] CRUD задач, приоритеты, статусы, связи с целью и этапом
- [ ] Повторяющиеся задачи как отдельные экземпляры → **Phase 2.5** (таблица и
  `src/lib/recurrence.ts` уже есть, проводка сервиса и форм — отдельным блоком)
- [x] Dashboard на реальных данных (empty/loading/error states)
- [x] История изменений цели — минимум: `created_at / updated_at / completed_at`
  в данных (блока «История» в UI нет)
  - ДОЛГ (осознанное расхождение с PRD §3.3): полноценный event log (`goal_events`)
    отложен в Phase 3+.

**Результат:** пользователь создаёт цели и работает с задачами.

## Phase 3 — Planner ✅ (итерация 4 закрыта 2026-11-04, миграция `0005_time_blocks` применена)

- [x] Day view и Week view
- [x] Настройки доступного времени (сон, работа, учёба, отдых)
- [x] Time blocks и проверка конфликтов
- [x] Алгоритм распределения задач + объяснение выбора слота
- [x] Предпросмотр плана: принять / отклонить / изменить вручную

**Результат:** пользователь формирует реалистичный план.

## Phase 4 — AI Assistant

- [ ] AI service layer в Edge Function (провайдер-независимый)
- [ ] Tool layer: `get_user_goals`, `get_user_tasks`, `get_weekly_progress`, `get_user_preferences`, `suggest_*`, `analyze_productivity`
- [ ] Structured output + JSON Schema валидация
- [ ] `ai_conversations`, `ai_messages`, `ai_proposals`
- [ ] Apply/reject предложений с серверной проверкой каждого действия
- [ ] Разбиение цели на этапы, weekly review, анализ невыполненных задач

**Результат:** AI помогает управлять системой, не меняя её без согласия.

## Phase 5 — Habits & Analytics

- [ ] Привычки, логи, streaks, completion rate
- [ ] Различение «пропущено» и «не запланировано»
- [ ] Графики (Recharts) по задачам, целям, привычкам
- [ ] Weekly review

**Результат:** расширенная система личного развития.

## Phase 6 — Testing & Deployment

- [ ] RLS и доступ к чужим данным (негативные тесты)
- [ ] Playwright: 12 обязательных сценариев из PRD §19
- [ ] Мобильная проверка основных сценариев
- [ ] Deploy: Vercel + Supabase, env в обоих окружениях
- [ ] Документация контрактов

## Definition of Done (для каждой задачи)

1. Функция реализована по PRD.
2. `npm run build`, `npm run lint`, `npm test` проходят.
3. Проверены права доступа (RLS / принадлежность записи).
4. UI имеет loading / empty / error / success состояния.
5. Обновлены типы и документация, если изменились контракты.
