# План Phase 5 — Habits & Analytics (план; код — отдельными шагами)

> **Статус (2026-11-06):** шаги 1, 1b, 2, 3, 4 реализованы и покрыты тестами;
> независимое security-ревью пройдено (блокер исправлен, повторное ревью —
> LIFT WITH NOTES; триггер проверен на реальном Postgres через PGlite —
> 8/8). `e2e/habits.spec.ts` написан, до применения миграций корректно
> скипается (проверено: 5 skipped). Миграции `0007`+`0008` текстом в git,
> **не применены**. Осталось: применение `0007`/`0008` владельцем после ревью,
> живая проверка (RLS двух пользователей, rollback, снимки, паузы) и полный
> e2e-прогон — затем закрытие Phase 5.

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
  target`) разрешено — продуктовой верхней границы нет; технический потолок —
  SQL `integer` (2³¹−1), продублирован в Zod общей константой `MAX_SQL_INTEGER`
  (fix-ревью шага 1).
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
   **не ломают streak** — пропускаются при подсчёте (по действующему
   расписанию; точность для периодов до смен расписания — см. п. 6).
5. Периоды без запланированных выполнений **не показываются как 0% провала** —
   пустое состояние (как Daily progress в Dashboard), а не нулевая метрика.
6. `pause`/`archive` **не удаляют логи** (гарантировано схемой: смена только
   статуса, каскада нет). **Решение владельца (2026-11-06): вариант A входит
   в Phase 5.** Дни пауз исключаются из streak/знаменателя, а история после
   смен `frequency`/`weekdays`/`targetCount`/`startDate` считается по версии,
   действовавшей тогда (шаг 1b + шаг 2). По одному текущему `status` прошлые
   паузы восстановить нельзя — поэтому прошлое хранится явно, а не выводится.
7. Граница недели (пн–вс ISO vs вс–сб) и учёт `start_date` внутри первой
   недели — решение шага 2: зафиксировать константой в `src/lib/habits.ts`
   с тестами на обе границы (рекомендация — ISO-понедельник, пояс
   пользователя); молча не выбирать.

**Прошлые паузы и смены расписания (решение A — входит в Phase 5, шаг 1b).**
Текущий `status` (`active|paused|archived`) не восстанавливает исторический
календарь: по одному флагу нельзя узнать, была ли привычка на паузе 3 недели
назад и какое расписание действовало тогда. Поэтому прошлое хранится явно:
append-only таблица `habit_schedule_versions (habit_id, effective_from DATE,
effective_to DATE NULL, frequency, weekdays, target_count, start_date,
status)` (шаг 1b). Пауза и смена расписания пишут интервал/снимок, прошлое
считается по версии, действовавшей тогда. Переименование и no-op историю
не меняют. Прошлое существующих строк не выдумывается: backfill шага 1b
ставит `effective_from = GREATEST(start_date, CURRENT_DATE)`.

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

### Шаг 1b. История расписания (миграция 0008, входит по решению A)

> Реализован 2026-11-06 (коммиты `ceedbed` + `9987dce`): файл, типы, мапперы,
> ревью-блокер и замечания исправлены, триггер проверен на PGlite 8/8.
> Миграция НЕ применена.

Файлы: `supabase/migrations/0008_habit_schedule_versions.sql` (текст, НЕ
применена), `src/types/database.ts` (`HabitScheduleVersionsRow` +
`mapHabitScheduleVersionRowToHabitScheduleVersion`), `src/types/domain.ts`
(`HabitScheduleVersion`), `src/types/habitScheduleMappers.test.ts`.

Готово: append-only `habit_schedule_versions` (владелец, `habit_id`,
`effective_from/effective_to`, `frequency/weekdays/target_count/start_date/
status`); создание привычки + снимок и смена расписания/статуса + снимок
атомарны в БД (триггер в той же транзакции, без `SECURITY DEFINER`);
день определяет сервер по IANA-поясу профиля (`habit_current_date()`,
fallback UTC); последнее изменение текущего дня — его снимок (upsert по
`UNIQUE (habit_id, effective_from)`), прошлые дни не переписываются;
переименование/no-op снимок не пишут (сравнение только трекаемых полей);
прошлое существующих строк не выдумывается
(`GREATEST(start_date, CURRENT_DATE)`); RLS 4 политики + `EXISTS`-гард
владения `habit_id`; CHECK/индексы как в `0007`.

Проверка: `npm run typecheck && npm run lint && npm test`
+ `git diff --check`.

### Шаг 2. Чистые расчёты по истории и сервисы (без UI)

> Реализован 2026-11-06 (коммиты `2232001`, `3007585`): `src/lib/habits.ts`
> + 24 теста, `habits/{api,errors,hooks,queryKeys}` + 22 теста.

Файлы: `src/lib/habits.ts` + `habits.test.ts` (scheduled?, dayDone, streak,
completion — семантика §3, пояс пользователя, границы недель/месяцев),
`src/features/habits/{api,schemas-расширение,errors,hooks,queryKeys}.ts` +
`api.test.ts` (CRUD, `logHabit` с upsert по `uq_habit_logs_habit_date`,
identity из JWT, инвалидация только `habits.*`).

Готово: streak/completion считают по §3 пп. 1–5 **по исторической версии,
действовавшей тогда** (шаг 1b): паузы и незапланированные дни исключены из
streak/знаменателя; тесты: сегодня не пропуск, незапланированные дни
пропускаются, weekly — сумма ISO пн–вс, пустой период — empty, часовой пояс
`Asia/Bishkek` у полуночи, смена частоты/цели, частичные недели, неизвестное
прошлое (нет версий — нет обязательств); N+1 нет (логи и версии — по одному
запросу на диапазон); RLS-негатив через чужой `habit_id` отклонён.
Patch привычки сервис валидирует после объединения со stored row
(например, `weekdays: []` недопустим при хранимой `frequency: weekdays`) —
Zod update-схема одна этого не ловит (см. комментарий в `schemas.ts`).

Проверка: `npm run typecheck && npm run lint && npm test`.

### Шаг 3. Habits UI

> Реализован 2026-11-06 (коммиты `0a2aac8`, `89bf491`): страница, 4 диалога,
> 5 page-тестов; lint-чисто.

Файлы: `HabitsPage.tsx` (замена `PhasePlaceholder`), `HabitFormDialog.tsx`,
`HabitRow.tsx` (+ streak-бейдж), `LogHabitDialog.tsx`, `DeleteHabitDialog.tsx`
(«логи N дней будут удалены» + название — удаление каскадное, Р5).

Готово: CRUD + отметка выполнения работают вручную; streak/completion из
шага 2; состояния loading/empty («Create your first habit…»)/error/success
(§9.4); подтверждение удаления; дизайн-токены без `rounded-lg|text-xs|…`
leftover (grep AGENTS.md §7 п. 6); 44px хит-зоны; тексты в `*_COPY`.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.

### Шаг 4. Analytics и weekly review

> Реализован 2026-11-06 (коммит `c79779d`): `summary.ts` + 12 тестов,
> страница + 3 теста, weekly review без модели.

Файлы: `AnalyticsPage.tsx` (замена заглушки), графики Recharts (задачи по
дням, прогресс целей, выполнение привычек — только реальные данные),
`WeeklyReview.tsx` (итог недели: completion rates + невыполненное, без «AI»
в названии — детерминированные строки, как Insights итерации 2).

Готово: периоды day/week/month/year; пустые периоды — empty states, а не 0%
(§3 п. 5); никаких выдуманных цифр (§7 PRD); weekly review собирается из
агрегатов шагов 2–3, без собственной копии формул.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.

### Шаг 5. Финальная проверка и закрытие Phase 5

> Частично 2026-11-06 (коммит `d3f17eb`): `e2e/habits.spec.ts` написан,
> pre-migration проверен (5 skipped). Осталось: применение `0007`+`0008`,
> живая проверка, полный e2e, отметки в ROADMAP/README.

Файлы: `e2e/habits.spec.ts` (создать → отметить → streak+1 → пропуск
незапланированного дня не ломает → пауза сохраняет логи → чужой `habit_id`
недоступен; live-ветка по тем же правилам, что `assistant.spec.ts`),
`docs/progress.md`, `docs/ROADMAP.md` (Phase 5 отмечена выполненным только
по факту), README (если меняется контракт).

Готово: полный gate + `npm run test:e2e` вручную; живые доказательства после
применения `0007`+`0008` владельцем: структура трёх таблиц, 12 политик,
RLS-негатив (чужой `habit_id` в логе — reject, чтение чужих строк — 0),
вставка/чтение от имени пользователя, снимки/паузы (см. инструкцию
в `docs/progress.md` записи шага 5).

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`
+ `npm run test:e2e` вручную.

## 5. Что НЕ входит в шаг 1 (и вообще в Phase 5 — явно)

- UI, сервисы, хуки, streak-расчёты, аналитика, weekly review (шаги 2–4).
- AI Assistant, Planner, Auth, почта/SMTP, уведомления (инфраструктуры
  напоминаний нет — только колонка `reminder_time`).
- Применение миграций `0007`+`0008` к живой БД в кодовых коммитах (только владелец
  отдельной командой после ревью).
- Изменения PRD под реализацию; закрытие всей Phase 5 этим коммитом.

## 6. Проверка шагов

Каждый шаг: `npm run typecheck && npm run lint && npm test` (+ `npm run build`
там, где указан) зелёные; `git diff --check` чист. Живая БД проверяется только
после применения `0007` владельцем — SQL-проверки на живой БД до этого момента
не заявлять как выполненные.
