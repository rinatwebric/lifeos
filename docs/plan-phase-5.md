# План Phase 5 — Habits & Analytics (план; код — отдельными шагами)

> **Статус (2026-11-05):** шаг 1 реализован в этом коммите и остановлен для
> внешнего code review (миграция `0007` текстом в git, **не применена**).
> Шаги 2–5 не начаты. Применение `0007` — отдельной командой владельца после
> ревью (как было с `0005`/`0006`).

## 1. Требование своими словами + ссылки на PRD

Привычки — маленькие повторяющиеся действия (читать, спорт, вода, сон до
23:00) с частотой daily / weekdays / weekly и целевым количеством. Пользователь
отмечает выполнение логами (дата, количество, комментарий); система показывает
current/best streak и completion rate, **различая «пропущено» и «не
запланировано»** (PRD §5: пропуск не удаляет историю). Аналитика — реальные
числа (completed/pending/overdue задачи, прогресс целей, weekly completion rate,
выполнение привычек) с графиками Recharts за день/неделю/месяц/год и weekly
review; пустые периоды — пустые состояния, а не 0% (PRD §7, §9.4).

Покрытие PRD: §5 (создание привычки, частота, tracking, streaks), §7
(метрики, периоды, графики, принцип «не давить цифрами»), §11.8–11.9 (схема
`habits` / `habit_logs`, UNIQUE `(habit_id, log_date)`), §11.13 (FK, индексы,
CHECK, RLS), §9.4 (loading/empty/error/success на каждом экране).

Границы (AGENTS.md §5–§7, решения итераций 2–4 не пересматривать): схема —
только файлами `supabase/migrations/NNNN_*.sql`, типы в том же коммите;
`service_role` и секреты — никогда во frontend/git; RLS не ослаблять,
`SECURITY DEFINER` — только с отдельным ревью; даты — UTC в БД, показ в поясе
пользователя (`src/lib/dates.ts`); без mock-данных в прод-путях; почта/SMTP
выключены бессрочно — уведомлений нет, `reminder_time` хранится, но
инфраструктура напоминаний вне Phase 5.

## 2. Решения шага 1 (зафиксированы этим коммитом, не пересматривать без владельца)

- Р1. Номер миграции — **`0007_habits_habit_logs`**: на момент постановки
  задачи файлы `0001–0006` существуют, `0007` свободен фактически.
  В `docs/plan-phase-4.md` номер `0007` упомянут для будущего AI RPC
  (`apply_proposal` атомарно) — самого файла нет. Разрешение коллизии: `0007`
  занимают привычки; backlog AI RPC при реализации обязан взять **`0008`**
  или позже. `plan-phase-4.md` как исторический документ не правится.
- Р2. `frequency in ('daily','weekdays','weekly')`, convention weekdays
  `0 = Sunday … 6 = Saturday` (как `0004`), пустой список при `weekdays` —
  reject, NULL-элементы — reject.
- Р3. `target_count INTEGER NOT NULL DEFAULT 1 CHECK (>= 1)`; `completed_count
  INTEGER NOT NULL DEFAULT 0 CHECK (>= 0)`; перевыполнение (`completed >
  target`) разрешено — верхней границы нет.
- Р4. Один лог на привычку и день: `UNIQUE (habit_id, log_date)`.
  `start_date`/`log_date` — календарные `DATE` пользователя;
  `created_at`/`updated_at` — `timestamptz`.
- Р5. Удаление привычки удаляет логи (`habit_logs.habit_id ON DELETE
  CASCADE`): лог без привычки бессмыслен. `pause`/`archive` — только смена
  статуса, строки и логи не трогают. Диалог удаления (шаг 3) — с явным
  подтверждением, как удаление цели.
- Р6. RLS: 8 политик (`habits_*_own`, `habit_logs_*_own`,
  `user_id = auth.uid()`); на INSERT/UPDATE логов дополнительно `EXISTS`
  владения `habit_id` (постура `0004`/`0005`: один `user_id = auth.uid()`
  скрыл бы подделку, но не запретил бы её создать). SELECT/DELETE логов —
  только `user_id`. Никаких `SECURITY DEFINER`.
- Р7. `domain.ts` не менялся: `Habit`/`HabitLog`/`HABIT_STATUSES` уже точно
  описывают схему. Zod-схемы входных данных не принимают `userId` —
  identity всегда из JWT (проверяется тестом).

## 3. Семантика streak/completion — зафиксирована для шага 2 (реализация там)

Шаг 2 обязан реализовать и покрыть тестами ровно это (чистые функции
`src/lib/habits.ts`, пояс пользователя через `toDateKey`):

1. `daily`/`weekdays`: `target_count` относится к **запланированному дню**
   (день выполнен ⇔ `completed_count >= target_count`).
2. `weekly`: `target_count` — **сумма выполнений за календарную неделю**,
   а не обязательство выполнять привычку ежедневно (неделя выполнена ⇔ сумма
   логов недели `>= target_count`).
3. Незавершённый **сегодняшний день** и **текущая неделя** — ещё не пропуск
   (streak жив, пока день/неделя не закрыты в поясе пользователя).
4. Незапланированные дни (день недели вне `weekdays`, дата до `start_date`)
   **не ломают streak** — пропускаются при подсчёте.
5. Периоды без запланированных выполнений **не показываются как 0% провала** —
   пустое состояние (как Daily progress в Dashboard), а не нулевая метрика.
6. `pause`/`archive` **не удаляют логи**; дни паузы исключаются из streak
   и из знаменателя completion rate (не считаются ни успехом, ни провалом).
7. Граница недели (пн–вс ISO vs вс–сб) и учёт `start_date` внутри первой
   недели — решение шага 2: зафиксировать константой в `src/lib/habits.ts`
   с тестами на обе границы (рекомендация — ISO-понедельник, пояс
   пользователя); молча не выбирать.

**Прошлые паузы и смены расписания (открытый долг, этим планом НЕ закрыт).**
Текущий `status` (`active|paused|archived`) не восстанавливает исторический
календарь: по одному флагу нельзя узнать, была ли привычка на паузе 3 недели
назад и какое расписание действовало тогда. Наличие `status` проблему не
решает — это зафиксировано здесь, чтобы шаг 4 не заявил обратное.
Минимальный вариант для отдельного шага после Phase 5: append-only таблица
`habit_schedule_versions (habit_id, effective_from DATE, effective_to DATE
NULL, frequency, weekdays, target_count, reason: paused|schedule_change)` —
пауза и смена расписания пишут интервал/снимок, а streak/completion считают
прошлые даты по версии, действовавшей тогда. Без такой таблицы история до
введения версий уточнению не подлежит — честно показывать «до <дата> точный
календарь неизвестен», а не додумывать.

## 4. Шаги (один шаг = один коммит; gate каждого — полный, см. §6)

### Шаг 1. Контракт данных (этот коммит, на ревью)

Файлы: `supabase/migrations/0007_habits_habit_logs.sql` (текст, НЕ применена),
`src/types/database.ts` (`HabitsRow`, `HabitLogsRow`, `mapHabitRowToHabit`,
`mapHabitLogRowToHabitLog`), `src/types/habitMappers.test.ts`,
`src/features/habits/schemas.ts` + `schemas.test.ts`
(create/update привычки и лога: частоты, статусы, weekdays, целые количества,
настоящие календарные даты, optional/null-поля, `userId` не принимается),
`docs/plan.md` (указатель), `docs/progress.md` (факты).

Готово: SQL в стиле `0004`–`0006`; мапперы и схемы покрыты тестами; UI не
изменился (`HabitsPage`/`AnalyticsPage` — заглушки); миграция не применена.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`
+ `git diff --check`.

### Шаг 2. Чистые расчёты и сервисы (без UI)

Файлы: `src/lib/habits.ts` + `habits.test.ts` (scheduled?, dayDone, streak,
completion — семантика §3, пояс пользователя, границы недель/месяцев),
`src/features/habits/{api,schemas-расширение,errors,hooks,queryKeys}.ts` +
`api.test.ts` (CRUD, `logHabit` с upsert по `uq_habit_logs_habit_date`,
identity из JWT, инвалидация только `habits.*`).

Готово: streak/completion считают по §3 (тесты: сегодня не пропуск,
незапланированные дни пропускаются, weekly — сумма, пустой период — empty,
пауза исключается, часовой пояс `Asia/Bishkek` у полуночи); N+1 нет (логи —
одним запросом на диапазон); RLS-негатив через чужой `habit_id` отклонён.

Проверка: `npm run typecheck && npm run lint && npm test`.

### Шаг 3. Habits UI

Файлы: `HabitsPage.tsx` (замена `PhasePlaceholder`), `HabitFormDialog.tsx`,
`HabitRow.tsx` (+ streak-бейдж), `LogHabitDialog.tsx`, `DeleteHabitDialog.tsx`
(«логи N дней будут удалены» + название — удаление каскадное, Р5).

Готово: CRUD + отметка выполнения работают вручную; streak/completion из
шага 2; состояния loading/empty («Create your first habit…»)/error/success
(§9.4); подтверждение удаления; дизайн-токены без `rounded-lg|text-xs|…`
leftover (grep AGENTS.md §7 п. 6); 44px хит-зоны; тексты в `*_COPY`.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.

### Шаг 4. Analytics и weekly review

Файлы: `AnalyticsPage.tsx` (замена заглушки), графики Recharts (задачи по
дням, прогресс целей, выполнение привычек — только реальные данные),
`WeeklyReview.tsx` (итог недели: completion rates + невыполненное, без «AI»
в названии — детерминированные строки, как Insights итерации 2).

Готово: периоды day/week/month/year; пустые периоды — empty states, а не 0%
(§3 п. 5); никаких выдуманных цифр (§7 PRD); weekly review собирается из
агрегатов шагов 2–3, без собственной копии формул.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.

### Шаг 5. Финальная проверка и закрытие Phase 5

Файлы: `e2e/habits.spec.ts` (создать → отметить → streak+1 → пропуск
незапланированного дня не ломает → пауза сохраняет логи → чужой `habit_id`
недоступен; live-ветка по тем же правилам, что `assistant.spec.ts`),
`docs/progress.md`, `docs/ROADMAP.md` (Phase 5 отмечена выполненным только
по факту), README (если меняется контракт).

Готово: полный gate + `npm run test:e2e` вручную; живые доказательства после
применения `0007` владельцем: структура обеих таблиц, 8 политик, RLS-негатив
(чужой `habit_id` в логе — reject, чтение чужих строк — 0), вставка/чтение от
имени пользователя (см. инструкцию в `docs/progress.md` записи шага 5).

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`
+ `npm run test:e2e` вручную.

## 5. Что НЕ входит в шаг 1 (и вообще в Phase 5 — явно)

- UI, сервисы, хуки, streak-расчёты, аналитика, weekly review (шаги 2–4).
- AI Assistant, Planner, Auth, почта/SMTP, уведомления (инфраструктуры
  напоминаний нет — только колонка `reminder_time`).
- Применение миграции `0007` к живой БД в кодовых коммитах (только владелец
  отдельной командой после ревью).
- Изменения PRD под реализацию; закрытие всей Phase 5 этим коммитом.
- `habit_schedule_versions` / интервалы пауз (§3-долг) — отдельный шаг после
  Phase 5, не часть приёмки.

## 6. Проверка шагов

Каждый шаг: `npm run typecheck && npm run lint && npm test` (+ `npm run build`
там, где указан) зелёные; `git diff --check` чист. Живая БД проверяется только
после применения `0007` владельцем — SQL-проверки на живой БД до этого момента
не заявлять как выполненные.
