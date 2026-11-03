# План текущей итерации

Обновляется перед каждой задачей. Выполненные пункты уезжают в `docs/progress.md`.
Формат: один шаг = один коммит = одна проверяемая единица работы.

## Итерация 2 — Phase 2: Goals & Tasks (ЗАКРЫТА 2026-11-04)

> **Статус:** итерация закрыта единицей 9 (этот план — исторический документ,
> спецификация ниже зафиксирована как ТЗ, по которому писался код).
> Закрыты единицы 1–6 и 8 + единица 9 (документы, `vercel.json`, скриншоты):
> `7086298`, `3741dbc`, `b0b870f`, `2a14c27`, `c14e4fd`, `2fe3110`, `a765736`,
> `ddcb42f`, `9e6af78`, `2ebfd23`, `608d161`, `dbfed51`, `041b090`, `e213fdc`.
> Фактический порядок: 1 → 2 → 3 → 4 → 5 → 6 → **8** → 9 (Unit 8 сделан раньше
> Unit 7 по решению 7 ниже, затем подтверждён фактом). Unit 7 (повторения)
> не выполнялся — вынесен в блок «Отложено в Phase 2.5».
> Ограничение «код НЕ писать» действовало только на старте итерации (спецификация
> до применения миграций); единицы 2–6 и 8 реализованы кодом. Детали и числа
> проверок — в `docs/progress.md` (запись 2026-11-04).

**Цель:** пользователь создаёт цели с этапами и работает с задачами; Dashboard показывает
реальные данные. Это план-спецификация: в этом чате код не пишется, миграции в БД
не применяются — только описываются.

**Источники:** PRD §3.3, §3.4, §11.3–11.6, §16, §18; `docs/ROADMAP.md` (Phase 2);
`docs/ARCHITECTURE.md`; AGENTS.md; `src/types/domain.ts`; миграции 0001/0002 как образец стиля.

**Границы итерации:**

- Код Phase 1 не трогать (auth, профиль, preferences, Settings, onboarding).
- Миграции `0003_goals_milestones` + `0004_tasks_recurrence` — тексты финализированы
  по решениям ниже; применение — только по команде «применяй» (файлы сначала в git,
  потом применение через MCP, потом доказательства).
  `0005_time_blocks` отложен в Phase 3: таблицу без UI везти смысла нет, значения
  `block_type` и слоты всё равно специфицируются там.
- Каждый unit оставляет приложение рабочим: `typecheck + lint + test` зелёные, роуты
  существуют (`/goals`, `/tasks` уже в `src/app/router.tsx`), заглушки заменяются
  прогрессивно, мёртвых кнопок нет (AGENTS.md §7).
- Живая проверка данных (signup-подобная, как в Phase 1) — один раз после применения
  миграций, перед Unit 2; unit-тесты и сборка до этого идут на моках/типах.

### Блокер перед стартом — СНЯТ (решения 2026-11-04, см. «Решения» ниже)

SQL Unit 1 финализирован: `tasks.goal_id ON DELETE SET NULL`,
`milestones.goal_id ON DELETE CASCADE`, `tasks.milestone_id ON DELETE SET NULL`,
статусы этапов `pending | completed`, eager-повторения с
`UNIQUE (recurrence_rule_id, due_date)` + `ON CONFLICT DO NOTHING`.

### Порядок единиц (факт закрытия 2026-11-04: выполнены 1–6, 8, 9; пункт 7 не
выполнялся — см. «Отложено в Phase 2.5» ниже, текст спецификации сохранён там)

1. **Схема Phase 2 + типы + чистые функции.** ✅ закрыта (`7086298`, `3741dbc`)
   Файлы: `supabase/migrations/0003_goals_milestones.sql`,
   `supabase/migrations/0004_tasks_recurrence.sql`,
   `src/types/domain.ts` (без изменений — нужные типы уже есть; комментарий
   про статусы этапов оставлен), `src/types/database.ts` (Row-типы + мапперы),
   `src/lib/recurrence.ts` (чистое разложение правила в даты + тесты).
   `isTaskOverdue` уже живёт в `src/lib/dates.ts` и покрыт тестами.
   Состав по PRD §11.3–11.6: `goals` (CHECK category/priority/status/progress 0–100/
   progress_mode; `CHECK (target_date IS NULL OR target_date >= start_date)` —
   «инвертированные интервалы запрещены», §11.13), `milestones` (position, CHECK статуса,
   `target_date`, `completed_at`), `tasks` (все поля §11.5; `CHECK
   (estimated_duration_minutes IS NULL OR ... > 0)`; `CHECK (scheduled_end IS NULL OR
   scheduled_start IS NULL OR scheduled_end > scheduled_start)`), `recurrence_rules`
   (§11.6; `weekdays <@ '{0,1,2,3,4,5,6}'`, `interval_value >= 1`,
   `end_date >= start_date`). На каждой таблице: `set_updated_at()`-триггер (как
   0001/0002), индексы `user_id` + частые фильтры (`goal_id`, `milestone_id`, `status`,
   `due_date`, `scheduled_start`), RLS 4 политики (`user_id = auth.uid()`).
   FK: `milestones.goal_id ON DELETE CASCADE`, `tasks.goal_id ON DELETE SET NULL`,
   `tasks.milestone_id ON DELETE SET NULL`, `tasks.recurrence_rule_id ON DELETE SET NULL`;
   каскада на `tasks` нет ни в каком виде. Кросс-тенантные ссылки закрыты в самих
   политиках (`EXISTS` на владение связанной строкой, решение 2026-11-04 п.1;
   композитные FK отвергнуты — лишний риск по версии PG). Частичный
   `UNIQUE (recurrence_rule_id, due_date)` для идемпотентной докатки.
   Готово: SQL показан целиком в стиле 0001/0002; `database.ts` обновлён
   в том же изменении (AGENTS.md §6); UI визуально не изменился.
   Проверка: `npm run typecheck && npm run lint && npm test`.
2. **Goals: сервис + хуки (без UI-изменений).** ✅ закрыта (`2a14c27`)
   Файлы: `src/features/goals/api.ts` (CRUD, `archive`/`pause`/`resume`/`complete` как
   смена статуса + `completed_at`, удаление — поведение по вопросу 1),
   `src/features/goals/schemas.ts` (Zod: title обязателен, `target_date >= start_date`,
   progress 0–100), `src/features/goals/hooks.ts` (TanStack Query: ключи
   `["goals"]`/`["goal", id]`, инвалидация), `api.test.ts`, `errors.ts`.
   Готово: CRUD покрыт тестами на моке клиента; ошибок Phase 1 не затронуто.
   Проверка: `npm run typecheck && npm run lint && npm test`.
3. **Goals UI: список, форма, статусы, удаление с подтверждением.** ✅ закрыта (`c14e4fd` + правки `2fe3110`)
   Файлы: `src/features/goals/GoalsPage.tsx` (замена `PhasePlaceholder`),
   `GoalForm.tsx`, `GoalCard.tsx`, `DeleteGoalDialog.tsx` (текст: «N задач останутся,
   но потеряют связь с целью» + название цели; удаление — `SET NULL`, каскада нет).
   Статус-переходы pause/resume/complete/archive по PRD §3.3. Состояния
   loading/empty/error/success, валидация форм (§16, §9.4). `progress_mode` — тоггл
   в форме (решение 4: переключение не стирает ручное значение). Готово: сценарии B (§15)
   и acceptance
   «Goals» (§18) выполняются вручную; чужой `user_id` недоступен (RLS).
   Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.
   Масштабирование прогресса: список грузит этапы одним запросом
   (`listAllMilestones` → `useAllMilestones`, группировка на клиенте, N+1 нет);
   при росте данных заменить на view/RPC с per-goal счётчиками — пока одной выборки
   достаточно.
4. **Milestones: CRUD, позиции, завершение, пересчёт прогресса.** ✅ закрыта (`a765736` + правки `ddcb42f`)
   Файлы: `src/features/goals/milestones/` (`api.ts`, `schemas.ts`, `MilestoneList.tsx`,
   `MilestoneForm.tsx`, тесты). Прогресс — `calculateGoalProgress` из `src/lib/progress.ts`
   (уже есть, покрыт тестами): режим `milestones` + есть этапы → derived; иначе ручное
   значение, clamp 0–100. Завершение этапа ставит `completed_at`; статусы
   `pending | completed` (решение 2, `in_progress` выводится из задач в Planner).
   Порядок через `position` (инкремент в сервисе, без UNIQUE — реордер без deferred).
   Готово: acceptance «можно создать/завершить этап, прогресс считается правильно» (§18).
   Проверка: `npm run typecheck && npm run lint && npm test`.
5. **Tasks: сервис + хуки (без UI-изменений).** ✅ закрыта (`9e6af78` + правки `2ebfd23`)
   Файлы: `src/features/tasks/api.ts` (CRUD, `complete`/`reopen`, `reschedule`,
   привязка `goal_id`/`milestone_id`, валидация принадлежности milestone→goal),
   `schemas.ts`, `hooks.ts` (фильтры: status/priority/goal/search; сортировка),
   `api.test.ts`. Overdue — вычисляемое на клиенте через `isOverdue` + `profiles.timezone`
   (PRD §3.4: не отдельный статус, авто-удаление/отмена запрещено).
   Готово: контракт покрыт тестами; проверка принадлежности записей (§18 Tasks).
   Проверка: `npm run typecheck && npm run lint && npm test`.
   **Сервисное правило (Unit 5, задокументировано — БД не трогать):** если в
   `createTask`/`updateTask` заданы оба `goal_id` и `milestone_id`, milestone
   обязан принадлежать этому goal — проверка чтением milestone в сервисе
   (`assertMilestoneBelongsToGoal`) до записи, ошибка `validation` с человеческим
   текстом. В БД такого констрейнта нет и не будет (миграции frozen): кросс-тенант
   закрыт RLS `EXISTS`-гардами 0004, а принадлежность внутри тенанта — правило
   сервиса. `countTasksForGoal` канонически живёт в `tasks/api.ts` (single
   source); `goals/api.ts` реэкспортирует его. Мутации задач инвалидируют
   `["tasks","list"]` (+ деталку) и, при привязке к цели, ключ
   `[...goals.detail(goalId), "task-count"]`. Сортировка по умолчанию:
   `due_date` asc nulls last, затем приоритет desc по явной карте
   `critical > high > medium > low` (не алфавит), затем `created_at` desc.
   Ошибки: общий маппинг вынесен в `src/lib/dbErrors.ts`
   (`DbServiceError` + `toDbError`); `goals/errors.ts` и `tasks/errors.ts` —
   тонкие обёртки под прежними именами.
    **Правило «этап без цели» (Unit 5 fix, 2026-11-04):** `createTask` отклоняет
    связку «milestone без goal» ошибкой `validation` («Select a goal before
    choosing a milestone, or clear the milestone.»); `updateTask` в том же
    случае ссылку молча очищает (`milestone_id = NULL`) — отвязка цели не
    должна оставлять висячую ссылку, а правка обязана быть прощающей.
    Покрыто тестами `api.test.ts`.
    **Инвалидация task-count (Unit 5 fix):** только мутации, меняющие связь
    с целью (`create`/`update`/`delete`; `useDeleteTask` принимает
    `{ id, goalId }` и инвалидирует по переданному `goalId`, кэш деталки
    может отсутствовать). `setTaskStatus`/`reschedule` связь не трогают —
    лишняя инвалидация убрана.
    **Сортировка и лимит (Unit 5 fix):** сортировка по умолчанию остаётся
    в памяти (`due_date` nulls last, затем ранг приоритета, затем
    `created_at` desc, затем `id`), потому что PostgREST не выражает
    ранжирование приоритетов; запрос ограничен `TASK_LIST_LIMIT = 500`
    (`.limit(500)` + серверная предсортировка), дальше — пагинация или
    серверное view.
6. **Tasks UI: список, фильтры, связи, жизненный цикл.** ✅ закрыта (`608d161` + правки `dbfed51`)
   Файлы: `src/features/tasks/TasksPage.tsx` (замена плейсхолдера), `TaskForm.tsx`
   (goal/milestone-селекты, даты, длительность), `TaskRow.tsx` (complete-кнопка),
   фильтры + поиск + сортировка (§3.4), перенос даты, удаление, reopen.
   Готово: сценарий D (§15) и acceptance «Tasks» (§18: создать/изменить/завершить/
   перенести, overdue корректно, чужие задачи недоступны).
   Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.
7. **Recurrence MVP — НЕ ВЫПОЛНЯЛСЯ, перенесён в Phase 2.5** (см. «Отложено
   в Phase 2.5» ниже; спецификация-решение 3 сохранена там как ТЗ).
8. **Dashboard на реальных данных (решение 5).** ✅ закрыта раньше Unit 7 (`041b090` + правки `e213fdc`, решение 7)
   Файлы: `src/features/dashboard/DashboardPage.tsx`, `useDashboardData.ts`
   (агрегация: `calculateCompletionRate`, сегодняшние задачи, активные цели).
   Реальные: welcome + дата/пояс (пояс — из `profiles.timezone`),
   Daily progress (empty state вместо 0% при пустом дне — уже заложено в `progress.ts`),
   Today's tasks (название/приоритет/время/статус/цель + кнопка завершения),
   Active goals (название/категория/прогресс/дедлайн/остаток этапов),
   блок **Insights** (без «AI» в названии): 1–2 детерминированные строки на реальных
   числах (overdue, нагрузка дня) — правила в коде, не модель; чат-ассистент — Phase 4.
   Честной заглушкой остаётся только Schedule preview («Nothing scheduled yet», Phase 3).
   Никаких выдуманных метрик — PRD §3.2, §22 п.4.
   Готово: пустые состояния объясняют следующий шаг (§9.4); без задач — честное
   «ничего не запланировано», а не 0%.
   Проверка: `npm run typecheck && npm run lint && npm test && npm run build`.
9. **История цели (минимум) + e2e + журнал (решение 6: вариант A).** ✅ закрыта
   частично: e2e (`auth`/`goals`/`tasks`/`dashboard`/`smoke`) + журнал
   (`docs/progress.md`) сделаны; блок «История» в карточке цели в UI НЕ рендерится
   (в данных есть `created_at / updated_at / completed_at`, полноценный
   `goal_events` — долг, см. ROADMAP Phase 3+).
   Файлы: блок «История» в карточке цели — `created_at / updated_at / completed_at`
   (без новой таблицы; полноценный `goal_events` — долг, см. ROADMAP),
   `e2e/goals-tasks.spec.ts` (создание цели → этап → задача → завершение → перенос →
   пересчёт прогресса — PRD §19 пп. 2–7; RLS-негативы и пп. 8–12 — Phase 6),
   `docs/progress.md` (запись итерации). Готово: полный gate зелёный.
   Проверка: `npm run typecheck && npm run lint && npm test && npm run build`
   (+ `npm run test:e2e` вручную при поднятом окружении — выполнено 2026-11-04,
   8/8, см. `docs/progress.md`).

### Отложено в Phase 2.5 — повторения (бывший Unit 7)

Причина: разовые задачи полностью закрывают поток «цель → задача → выполнение»
(PRD-сценарий D и acceptance «Tasks» зелёные без повторений); проводка сервиса
и форм повторений — отдельный небольшой блок после деплоя, а не часть
закрываемой итерации. Дизайн зафиксирован решением 3 и не меняется;
таблица `recurrence_rules` уже в схеме (миграция 0004), чистый разложитель
`src/lib/recurrence.ts` с тестами уже в коде.

Спецификация (ТЗ для Phase 2.5):

7. **Recurrence MVP (решение 3: eager + докатка).**
   Файлы: `src/features/tasks/recurrence/` (`topUpRecurrenceInstances.ts` — сервис:
   генерация на 30 дней вперёд при сохранении правила + докатка при входе в приложение
   (вызов после логина), вставка с `ON CONFLICT DO NOTHING` по
   `uq_tasks_recurrence_instance`; `RecurrenceForm.tsx` — daily / дни недели / weekly
   по §3.4; тесты на границы: `end_date`, идемпотентность докатки). Правила: правка
   экземпляра не трогает правило и серию (отвязка `recurrence_rule_id = NULL`);
   правка правила влияет только на будущие ещё не созданные даты, созданные экземпляры
   не перегенерируются; удаление правила — `SET NULL` (история цела).
   Готово: правило создаёт отдельные экземпляры с привязкой к правилу; повторная
   докатка и два устройства дублей не плодят.
   Проверка: `npm run typecheck && npm run lint && npm test`.

### Проверка итерации

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Плюс ручная проверка: два аккаунта не видят данные друг друга (RLS на новых таблицах),
сценарии B и D из PRD §15, overdue считается по `profiles.timezone`, удаление цели
показывает число отвязываемых задач (решение 1).

### Что можно урезать, если время поджимает (хакатон)

- **Unit 9 (история):** оставить только строку `created/updated` на карточке цели; e2e
  свести к одному сценарию «цель → задача → завершение». Аудит-таблицу не заводить.
- **Unit 7 (recurrence):** вырезать целиком — только разовые задачи; правило повторить
  вручную. Серия и генерация уезжают в Phase 3 вместе с planner.
- **Unit 8 (dashboard):** оставить реальные только Today's tasks + Active goals;
  Daily progress и детерминированные хинты — заглушки до Phase 3/4.
- **Unit 6 (tasks UI):** поиск и сортировку вырезать, оставить фильтр по статусу.
- **`0005_time_blocks`:** уже отложен в Phase 3 решением итерации (не урезание,
  а план: таблице без UI в Phase 2 делать нечего).
- **Нельзя урезать:** RLS + CHECK в миграциях, подтверждение удаления цели,
  empty/loading/error-состояния, инвариант «AI/insights без выдуманных цифр».

### Вне этой итерации

Planner Day/Week, time blocks UI + миграция `0005_time_blocks`, алгоритм распределения
(Phase 3); AI service layer, tool layer, proposals, чат-ассистент (Phase 4);
полноценный `goal_events` — долг, см. ROADMAP Phase 2.

### Решения (приняты 2026-11-04)

1. **Удаление цели — вариант A.** `tasks.goal_id ON DELETE SET NULL`,
   `milestones.goal_id ON DELETE CASCADE`, `tasks.milestone_id ON DELETE SET NULL`.
   Каскада на `tasks` нет ни в каком виде. Диалог удаления: «N задач останутся,
   но потеряют связь с целью» + название цели (ввод названия не нужен, хватает кнопки
   Delete). Индекс по `tasks.goal_id` добавлен (`idx_tasks_goal_id`).
2. **Статусы этапов — вариант A.** `pending | completed`, `in_progress` не вводим:
   PRD список не задаёт, а «в работе» выводится из задач этапа, когда появится Planner.
   Комментарий в `domain.ts` и `ARCHITECTURE.md` §7 оставлен.
3. **Повторения — eager (вариант A) с уточнениями.** Генерация 30 дней вперёд при
   сохранении правила + докатка при входе в приложение (сервис
   `topUpRecurrenceInstances`, вызывается после логина). `UNIQUE
   (recurrence_rule_id, due_date)` + `ON CONFLICT DO NOTHING` — иначе дубли при двух
   устройствах. Правка экземпляра не трогает правило и серию (PRD §3.4). Правка правила
   влияет только на будущие ещё не созданные даты; созданные экземпляры
   не перегенерируются.
4. **progress_mode — тоггл в форме цели, подтверждено.** Правила: переключение в
   `milestones` не обнуляет сохранённое ручное значение (`progress`); при
   `mode = milestones` и 0 этапов показываем ручное (`calculateGoalProgress` уже так
   делает); переключение обратно в `manual` возвращает последнее ручное значение.
5. **Dashboard — подтверждено.** Реальные: дневной прогресс, сегодняшние задачи,
   активные цели (с прогрессом и этапами). Schedule — честная заглушка
   «Nothing scheduled yet» до Phase 3. Блок Insights: 1–2 детерминированные строки
   на реальных числах, название — «Insights» без «AI» (правила в коде, не модель;
   PRD §3.2 соблюдён, пользователя про AI не врём). Чат-ассистент — Phase 4.
6. **История цели — вариант A.** Сейчас: `created_at / updated_at / completed_at`
   в карточке цели. Настоящая история (`goal_events`) отложена и зафиксирована
   в ROADMAP как долг. **Осознанное расхождение с PRD §3.3** («просматривать историю
   изменений»): упрощённая реализация в Phase 2, полноценный event log в Phase 3+.
7. **Порядок Unit 7/8 изменён (решение 2026-11-04): сначала дашборд (Unit 8),
   потом повторения (Unit 7).** Причина: дашборд на реальных данных раньше
   покажет, хватает ли текущих запросов/индексов под ежедневные выборки, а
   eager-повторения уже зафиксированы решением 3 и никуда не денутся. Миграции
   и БД это решение не затрагивает.

---

## Архив — Итерация 1.2: Auth, профиль, настройки времени (Phase 1, ЗАКРЫТА)

**Цель:** пользователь может зарегистрироваться, войти, выйти и попасть на Dashboard со своим профилем;
все данные закрыты RLS.

### Решения по неоднозначностям (приняты)

1. Email confirmation: поддерживаем оба пути по факту ответа Supabase, а не по константе.
   После `signUp` смотрим на `data.session`: `session !== null` — сразу редирект на `/`
   (confirmation OFF); `session === null` — экран check-email с кнопкой resend, подсказкой
   про спам и ссылкой «вернуться ко входу». Возврат по ссылке из письма работает через
   `detectSessionInUrl`. Кейс «email уже зарегистрирован» — без утечки факта существования аккаунта.
2. Onboarding: один шаг, не многошаговый визард. После первого входа — диалог «Настроим твой день»
   (timezone + wake/sleep) с кнопкой Skip, после сохранения или Skip — Dashboard. Условие показа —
   `profiles.onboarded_at IS NULL`, диалог не блокирует роуты (подсказка, не гейт). Форма одна,
   переиспользуется в Settings. Дефолты: `timezone` из браузера при `signUp`
   (`options.data.timezone`), fallback `'UTC'`; `wake 07:00`, `sleep 23:00`. Строку
   `user_preferences` создаёт триггер (insert), визард/клиент делают только update.

### Статус (2026-11-03) — итерация 1.2 ЗАКРЫТА

- Единицы 1–5 закрыты (коммиты `70c8811`, `23da785`, `2646201`, `27dbfd3`, `fc89f96`;
  плюс `07b02d3` — правки ревью единицы 3 и `d3f0e70` — дефолт `emailRedirectTo` в `signUp`).
- Единица 6 закрыта (коммит `d3029a2`): `e2e/auth.spec.ts` (5 live-сценариев),
  `e2e/helpers.ts`, `playwright.config.ts` (загрузка `.env.e2e`, хост `127.0.0.1`,
  1 worker), Sign out в Settings, `scripts/verify-rls.mjs`, `smoke.spec.ts` переписан
  под гарды. Детали — в `docs/progress.md`.
- Факт: email confirmation=ON — экраны реализуют обе ветки по `data.session`.
- Дальше — итерация Phase 2 (Goals & Tasks) новым чатом, контекст этой сессии не тащить.

### Порядок единиц (не менять, каждая = один коммит)

1. **Миграции + типы.** Файлы: `supabase/migrations/0001_profiles.sql`,
   `supabase/migrations/0002_user_preferences.sql`, `src/types/domain.ts`,
   `src/types/database.ts`. Проверка: `npm run typecheck && npm run lint && npm test`.
   Готово: SQL показан целиком и подтверждён, только потом применяется; после применения
   проверен signup с появлением строк в обеих таблицах — и только потом единица 2.
   - Одна функция `handle_new_user`: `SECURITY DEFINER`, `SET search_path = ''`
     (требует явного ревью по AGENTS.md §5), вставляет `profiles` + `user_preferences`
     с `ON CONFLICT DO NOTHING`. `timezone` из `new.raw_user_meta_data->>'timezone'`, fallback `'UTC'`.
     Противоречий нет: триггер делает insert, клиент — только update.
   - Общая функция `set_updated_at()` + `BEFORE UPDATE` триггеры на обе таблицы.
   - Ограничения явно: `theme IN ('light','dark')`, `language IN ('en','ru','ky')`,
     jsonb-поля `NOT NULL DEFAULT '{}'::jsonb` + `CHECK (jsonb_typeof(col) = 'object')`,
     `UNIQUE(user_id)` на `user_preferences`. CHECK без списка значений не принимается.
   - `profiles.onboarded_at TIMESTAMPTZ NULL`; условие диалога — `onboarded_at IS NULL`.
   - RLS: `profiles`: `id = auth.uid()`; `user_preferences`: `user_id = auth.uid()`.
   - Типы: `database.ts` — snake_case схема Supabase, `domain.ts` — camelCase приложение,
     маппинг на границе сервиса. Позже `database.ts` заменить на `supabase gen types`.
2. **Auth-сервис.** Файлы: `src/features/auth/api.ts`
   (`signUp`, `signIn`, `signOut`, `resetPassword` с `redirectTo`, `updatePassword`,
   `resendConfirmation`, `getSession`, `onAuthStateChange`), `src/features/auth/errors.ts`,
   `src/features/auth/api.test.ts`. Проверка: `npm run typecheck && npm run lint && npm test`.
3. **Провайдер сессии.** Файлы: `src/features/auth/AuthProvider.tsx` (+ `useAuth()`),
   `src/app/providers.tsx`, `src/features/auth/AuthProvider.test.tsx`.
   Порядок: `QueryClientProvider → AuthProvider`. Кеш чистить на `SIGNED_OUT` и при смене
   `user.id`. Наружу `status: 'loading' | 'authenticated' | 'anonymous'`; `RequireAuth`
   не редиректит пока `loading` (без мигания, deep link сохраняется). Проверка та же.
4. **Экраны.** Файлы: `src/features/auth/schemas.ts`, `src/features/auth/SignInPage.tsx`,
   `src/features/auth/SignUpPage.tsx`, `src/features/auth/ResetPasswordPage.tsx`
   (два режима: запрос письма + установка нового пароля). Проверка та же.
   Готово: RHF + Zod, loading/error/success, оба пути confirmation, resend + back-link.
5. **Защищённые роуты + Settings.** Файлы: `src/app/router.tsx`
   (auth-экраны вне `AppLayout`, `AppLayout` обёрнут в `RequireAuth`),
   `src/features/auth/RequireAuth.tsx`, `src/features/settings/OnboardingDialog.tsx`
   (живёт в settings, не в auth), `src/features/settings/PreferencesForm.tsx` (общая форма),
   `src/features/settings/api.ts`, `src/features/settings/SettingsPage.tsx` + theme.
   Проверка та же. Готово: без сессии → `/sign-in`; диалог только при `onboarded_at IS NULL`.
   Статус: единица 5 закрыта. Роуты + RequireAuth/RedirectIfAuthed (loading без редиректа, anonymous -> /sign-in, authed -> /), useAuth в отдельном файле, resendConfirmation с дефолтом emailRedirectTo=<origin>/, Settings (профиль + day setup: два update с раздельными ошибками, инвалидация ключей), тема (profiles.theme + localStorage + inline-скрипт в index.html), OnboardingDialog (Save/Skip пишут onboardedAt, Escape=Skip, без фокус-трапа). Тесты 100/100 (75 старых + 25 новых: guards, settings api, onboarding, settings page).
6. **Тесты + журнал.** Файлы: `src/features/auth/RequireAuth.test.tsx`, RTL-тесты форм,
   `e2e/auth.spec.ts`, `docs/progress.md`. Проверка:
   `npm run typecheck && npm run lint && npm test && npm run build`.
   Статус: закрыта (`d3029a2`).

### Проверка

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Плюс ручная проверка: два аккаунта не видят данные друг друга (RLS), выход очищает кеш запросов,
часовой пояс сохраняется и используется в Dashboard.

### Вне этой итерации

Goals/Tasks CRUD (Phase 2), Planner (Phase 3), AI (Phase 4).
