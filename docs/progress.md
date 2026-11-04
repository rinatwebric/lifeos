# Журнал прогресса

Состояние проекта живёт в файлах и Git, а не в памяти модели. Каждая запись — дата, что сделано,
чем проверено, что осталось.

## 2026-11-06 — Phase 5: шаги 1b, 2, 3, 4 (код готов, миграции НЕ применены)

**Решение владельца (2026-11-06): вариант A входит в Phase 5** — минимальная
история расписания и пауз реализована отдельным шагом 1b, а не отложена.
Предыдущие указания останавливаться после каждого шага заменены целью.

**Сделано (коммиты от `08af9cb`)**

- `ceedbed` шаг 1b: `supabase/migrations/0008_habit_schedule_versions.sql`
  (текст, НЕ применена) — append-only `habit_schedule_versions` (владелец,
  `habit_id`, `effective_from/effective_to`, `frequency/weekdays/target_count/
  start_date/status`); создание + снимок и смена расписания/статуса + снимок
  атомарны в БД (AFTER-триггер в той же транзакции, `SECURITY INVOKER`, без
  `DEFINER`); день определяет сервер по IANA-поясу профиля
  (`habit_current_date()`, fallback UTC); последний change дня — его снимок
  (`UNIQUE (habit_id, effective_from)`), прошлые дни не переписываются;
  переименование/no-op снимок не пишут; backfill без выдуманного прошлого
  (`GREATEST(start_date, CURRENT_DATE)`); RLS 4 политики + `EXISTS`-гард
  владения `habit_id`; CHECK/индексы как в `0007`. Типы: `HabitScheduleVersion`
  (`domain.ts`), `HabitScheduleVersionsRow` + маппер (`database.ts`), 2 теста.
- `2232001` шаг 2 (часть 1): `src/lib/habits.ts` + 22 теста — чистая
  версионная математика: planned/completed/missed, current/best streak,
  completion rate (null при пустом периоде, настоящие нули, потолок 100%,
  перевыполнение сохраняется). Daily/weekdays — день, weekly — ISO-неделя
  пн–вс (сумма). Сегодня/текущая неделя до завершения — не пропуск;
  паузы/незапланированные дни/неизвестное прошлое — не провалы; смена
  частоты/цели, частичные недели, `Asia/Bishkek` у полуночи.
- `3007585` шаг 2 (часть 2): `habits/{api,errors,hooks,queryKeys}.ts` + 22
  теста — CRUD, pause/resume/archive, idempotent `logHabit` (upsert по
  `uq_habit_logs_habit_date`, повтор без дублей), история read-only из
  триггера, patch валидируется после merge со stored row, identity из JWT,
  постраничные range-чтения без молчаливого урезания, инвалидация только
  `habits.*` (проверено: `goals` не трогается), `listAllHabitVersions` одним
  запросом (без N+1).
- `0a2aac8` + `89bf491` шаг 3: Habits UI — `HabitsPage` (loading/empty/error/
  success, reload), `HabitFormDialog` (частоты, weekdays-чекбоксы,
  target/start/reminder/status; reminder хранится, уведомления не обещаются),
  `HabitRow` (streak-бейдж, completion), `LogHabitDialog` (дата/количество/
  комментарий), `DeleteHabitDialog` ("N logged days будут удалены" + название).
  Токены, 44px хит-зоны, keyboard/focus (`data-autofocus`, Esc, возврат
  фокуса), English COPY, light/dark через токены, mobile-first.
- `c79779d` шаг 4: Analytics — периоды day/week/month/year, задачи
  (completed/pending/overdue, completed-in-period of due), цели (active, avg
  progress), привычки (units done of planned), 4 Recharts-графика (задачи по
  дням/месяцам, категории, прогресс целей, completion привычек — только
  реальные данные, пустые периоды — empty states), детерминированный
  `WeeklyReview` (без "AI", с явными знаменателями). Формулы не
  дублируются: привычки через `src/lib/habits.ts`.
- `d3f17eb` шаг 5 (часть 1): `e2e/habits.spec.ts` — 5 спек (create → log →
  streak+reload, unscheduled weekday, pause/resume, RLS-негатив, analytics
  периоды + reload). Все скипаются без provisioned таблиц (проба anon-GET,
  как `planner.spec.ts`).
- `9987dce` fix по независимому ревью (см. ниже).

**Независимое ревью (security-auditor, 2 сессии)**

- Сессия 1 — BLOCK: будущий `start_date` + tracked UPDATE = CHECK-аборт
  всей транзакции (close ставил `effective_to = today-1` на будущую строку);
  + should-fix: мусор в `profiles.timezone` ронял бы все tracked UPDATE
  (нет CHECK в 0001), future `log_date` рассинхронизировал weekly
  day-status и stats; + 5 notes.
- Исправлено: close только `effective_from < today`, refresh будущих строк
  в обоих путях, today-row bounded (`min(future)-1`, single-open invariant);
  INSERT `GREATEST(start_date, creation-day)`; `habit_current_date` —
  plpgsql с `EXCEPTION WHEN invalid_parameter_value → UTC`; weekdays
  нормализуются в триггере (order-insensitive); weekly day-status суммирует
  только дни `<= dateKey`; partial-week flush bounded днём смены.
- PGlite (настоящий Postgres, WASM): тело миграции + триггер прогнаны по
  8 сценариям — 8/8 зелёных (применение, future-start + pause без аборта,
  same-day double upsert, rename без снимка, мусорный timezone → UTC,
  pre-creation дни uncovered, прошлые строки побайтово неизменны). RLS в
  PGlite не проверялась (нет JWT-контекста) — только статически.
- Сессия 2 — **LIFT WITH NOTES** (notes: backfill CURRENT_DATE vs tz-date
  skew задокументирован в миграции; weekdays sort без dedupe — тривиально).
  Scope-check: дифф только 3 файла фиксов, дрейфа нет.

**Проверено (числа)**

- `npm run typecheck` — ok; `npm run lint` — 0 errors / 17 warnings (16
  baseline + 1 новый `watch()` того же известного класса);
  `npm test` — **794/794 в 82 файлах** (было 726/75);
  `npm run build` — ok; `git diff --check` — чист.
- `npx playwright test e2e/habits.spec.ts` — **5 skipped** (таблицы
  отсутствуют живьём — спека корректно не падает; до фикса скипов 4 failed —
  UI-шаги тоже требовали пробу, исправлено). Живой прогон UI невозможен до
  применения миграций. Полный e2e не гонялся (беречь Auth rate limit).
- Живая БД не тронута схемой: `list_migrations` — 0001–0005 (0006
  применена вне истории, таблицы ai_* на месте); `habits*` таблиц нет.
  Побочных записей нет (создания падали на отсутствующей таблице).

**Осталось (требует владельца)**

- Применить `0007`+`0008` отдельной командой после ревью + живая проверка
  RLS (2 пользователя, rollback, снимки, паузы — инструкция шага 5 в
  `docs/plan-phase-5.md`), затем `npm run test:e2e` (habits + analytics +
  reload + mobile) и закрытие Phase 5 в ROADMAP/README.
- Известно и принято: `getSession()` в habits/api (как в tasks) вместо
  `getUser()` (RLS перепроверяет JWT — note ревью, не дефект); backfill
  skew ≤1 день у полуночи (one-shot, задокументировано); weekday duplicates
  `{1,1,2}` мнут шумную версию при прямом SQL (сервис/UI дубли не шлют).

## 2026-11-03 — Итерация 1.2, единица 6: e2e, RLS, закрытие итерации

**Сделано**

- Баг регистрации (`d3f0e70`, задача 1 отдельным коммитом): `signUp` теперь передаёт
  `emailRedirectTo` с дефолтом `${window.location.origin}/` (как `resetPassword` и
  `resendConfirmation`) — письмо больше не уходит на дефолтный Site URL. Плюс
  `SignUpInput.emailRedirectTo` для явного оверрайда. Тесты: дефолт, оверрайд,
  обновлены ожидания в `SignUpPage.test.tsx`. Заодно закоммичены `.gitignore`
  (игнор `.env.*` + исключение `.env.e2e.example`) и `.env.e2e.example`.
- Sign out в Settings (не было UI для выхода вообще): новая карточка с кнопкой,
  вызывает `signOut()`; редирект на `/sign-in` делает сам `RequireAuth` по смене
  статуса (навигационный вызов не нужен). 2 unit-теста (успех + ошибка). Тестов 104/104.
- `e2e/auth.spec.ts` (new, 5 сценариев, каждый в чистом контексте): anon `/` → `/sign-in`;
  вход тестовым пользователем → Dashboard `/`; `/settings` wake/sleep → reload →
  значения сохранились; sign out → `/sign-in`, повторный `/` недоступен; `/sign-up`
  с новым адресом на реальном домене → «Check your email» (письмо не открываем).
  Без `E2E_*` — `test.skip` всем файлом, CI без секретов зелёный.
- `e2e/helpers.ts` (new): общий `signIn` (ждёт URL `/` — fail fast при 429),
  `dismissOnboarding` (диалог монтируется после profile query — ждёт до 8 с, иначе no-op).
- `e2e/smoke.spec.ts` переписан под гарды (старый утверждал анонимный дашборд —
  теперь это редирект по дизайну): вход → дашборд → переход в Goals.
- `playwright.config.ts`: загрузка `.env.e2e` встроенным `node:fs` (без новых
  зависимостей, `process.env` в приоритете), dev-сервер на `127.0.0.1` (vite-`localhost`
  упирался в IPv6 и webServer висел 120 с), `workers: 1` — параллельные входы одним
  аккаунтом триггерят Auth rate limit.
- `scripts/verify-rls.mjs` (new, ручной запуск, не в `npm test`): только anon key,
  11 проверок — anon видит 0 строк, A читает/пишет только своё, чужой id: select 0
  строк + update 0 строк, round-trip своих wake/sleep с restore. Результат: ALL PASSED.
- Найденные по ходу дела факты (все учтены в коде/тестах): диалог onboarding
  обгоняет `dismiss` (лечится ожиданием); сообщение «Day setup saved.» мигает и
  пропадает при ремаунте после refetch — в e2e завершение ждём по PATCH-ответам
  `profiles`/`user_preferences`, а не по тосту; `input[type=time]` нормализует к
  `HH:MM:SS` — ассёрты под это.
- Доки: `docs/plan.md` — итерация 1.2 закрыта; `docs/ROADMAP.md` — Phase 1 отмечен
  выполненным (только реально сделанное); `README` — статус Phase 1 done, раздел
  «Как проверить локально», Redirect URLs дополнены `/` и `127.0.0.1`.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors (11 известных `react-refresh/only-export-components` warns)
- `npm test` — 104/104 (100 старых + 4 новых: 2 signUp-дефолт + 2 sign-out)
- `npm run build` — ok (плюс `npx playwright install chromium` один раз)
- `npm run test:e2e` — 6/6 (5 auth + 1 smoke), chromium, один воркер
- RLS: `scripts/verify-rls.mjs` — 11/11 PASS; в БД ровно 4 политики
  (`profiles_*_own`: `id = auth.uid()`, `user_preferences_*_own`: `user_id = auth.uid()`,
  только `authenticated`) — изоляция на уровне БД, не клиентского кода
- Второй аккаунт B не создавался (нет auth-admin инструментария, `service_role`
  запрещён): чужой id в скрипте эквивалентен строке B, т.к. все политики —
  `... = auth.uid()`. Прямая проверка «B не видит A» — осталось вручную через
  Dashboard → Users → Add user при желании.

**Осталось**

- Удалить 3 unconfirmed тестовых пользователя через Dashboard → Users:
  `e2e.signup.1793724205778@`, `e2e.signup.1793724335040@`, `e2e.signup.1793731022764@`
  (все `@gmail.com`; Failed-пробы юзеров не создали).
- В project URL Configuration убедиться, что добавлены `/` и `127.0.0.1`-варианты
  (список — в README); иначе письма подтверждения/восстановления уходят на Site URL.
- Проектный email-лимит (`over_email_send_rate_limit`) срабатывает уже после пары
  отправок: полный e2e-прогон — не чаще раза в ~2 часа; перед расширением e2e
  в Phase 2 настроить custom SMTP, иначе 429 будет нормой.
- Дальше — Phase 2 (Goals & Tasks) по `docs/plan.md` новым чатом.

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

## 2026-11-03 — Итерация 1.2, единица 1: миграции закрыта

**Сделано**

- Файлы `supabase/migrations/0001_profiles.sql` + `0002_user_preferences.sql` созданы и закоммичены
  до применения (`70c8811`); применены через Supabase MCP и записаны в `supabase_migrations`:
  `0001_profiles@20261102200628`, `0002_user_preferences@20261102200637`.
- П.6 принят как есть: расхождение применённого SQL с файлами — только ведущий пробел в одной
  строке DDL (no-op), объекты в БД соответствуют файлам, пересоздание миграции не нужно.
- `.env.local` заполнен из MCP (URL + anon key, git-ignored); Supabase MCP (`opencode.json`) настроен.
- Факт: email confirmation=ON (`email_confirmed_at=null`, сессии после signUp нет) — экраны
  реализуют обе ветки по `data.session`.

**Проверено (доказательства из БД, не слова)**

- Колонки обеих таблиц, `relrowsecurity=true`, ровно 4 политики (select+update своих строк),
  3 триггера, CHECK language/theme/jsonb, обе функции `security definer` + `search_path=""`.
- signUp-тест (`timezone=Asia/Bishkek` в metadata): строки появились в `profiles` (timezone +
  full_name из metadata) и `user_preferences` (дефолты 07:00/23:00/`{}`).
- Тестовый пользователь `it12.verify.20261102@gmail.com` удалён, каскад проверен (0/0/0);
  в итерацию 2 ничего не перешло. `@example.com` Auth отклоняет — для e2e брать реальный домен.

**Осталось**

- Единица 2: auth-сервис (типы `Profile`/`UserPreferences` + `database.ts` — в коммите единицы 2).
- Единицы 3–6 по `docs/plan.md`. Следующая задача — новым чатом.

## 2026-11-03 — Итерация 1.2, единица 2: auth-сервис закрыта

**Сделано**

- `src/features/auth/api.ts`: `signUp` (metadata `timezone` + `full_name` для триггера
  `handle_new_user`, `needsConfirmation = session === null`), `signIn`, `signOut`,
  `resetPassword(email, redirectTo?)`, `updatePassword` (recovery-флоу),
  `resendConfirmation`, `getSession`, `onAuthStateChange` (возвращает `unsubscribe`).
- `src/features/auth/errors.ts`: `AuthServiceError` + `toAuthError` (матчинг по
  `code`/`status`, fallback по тексту; `user_already_exists` — generic-копия без утечки
  факта регистрации) + `AUTH_ERROR_MESSAGES` (единый источник копий под локализацию).
- `src/features/auth/api.test.ts`: 17 тестов на моке `getSupabaseClient` — обе ветки
  confirmation, metadata триггера, recovery-флоу, маппинг ошибок.
- `src/types/database.ts` (new): snake_case-зеркало миграций 0001/0002 + мапперы
  `mapProfileRowToProfile` / `mapUserPreferencesRowToUserPreferences` в camelCase.
- `src/types/domain.ts`: `Profile` (id = auth user id, без отдельного `userId`),
  `UserPreferences` (extends `BaseEntity`), `PROFILE_LANGUAGES`/`PROFILE_THEMES`.
- Смежный фикс (гейт AGENTS.md §3): `src/app/App.test.tsx` мокает `@/lib/env` как
  unconfigured — тест баннера зависел от локального `.env.local` (заполнен в единице 1)
  и падал при настроенном окружении; прод-код не тронут.
- В БД ничего не применялось (миграции уже закрыты в единице 1).

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — ok
- `npm test` — 34/34 (17 старых + 17 новых auth)
- Падение `App.test.tsx` до фикса подтверждено как предсуществующее и окруженческое:
  дашборд рендерился, баннер отсутствовал, т.к. `.env.local` заполнен; файлы единицы 2
  на `isSupabaseConfigured` не влияют.

**Осталось**

- Единицы 3–6 по `docs/plan.md` (провайдер сессии → экраны → роуты/Settings → тесты+журнал).

## 2026-11-03 — Итерация 1.2, единица 3: провайдер сессии закрыта (+ правки 1–4)

**Сделано**

- `src/features/auth/AuthProvider.tsx` (new): `status: 'loading' | 'authenticated' | 'anonymous'`
  - `user` + `session` через `useAuth()`. Кеш чистится на `SIGNED_OUT` и при смене `user.id`
    (первая эмиссия только инициализирует, `INITIAL_SESSION` повтор — no-op). Порядок в
    `src/app/providers.tsx`: `QueryClientProvider → AuthProvider`.
- `src/features/auth/AuthProvider.test.tsx` (new, 6 тестов): loading→anonymous/authenticated,
  SIGNED_OUT → `clear()` + `getSession` больше не вызывается, смена user → `clear()`,
  повтор той же сессии — без `clear()`, StrictMode: 2 подписки → первая отписана, unmount —
  вторая отписана, `useAuth` вне провайдера кидает.
- Правка 3 (deadlock): в колбэке `onAuthStateChange` только `setState` + `clear()`,
  никаких вызовов Supabase; init (code exchange + `getSession`) — в теле эффекта;
  загрузка профиля — отдельным `useEffect` по `user.id` (единица 5), зафиксировано
  комментарием в провайдере.
- Правка 4 (recovery flow): проект на implicit flow (клиент: `detectSessionInUrl: true`,
  без `flowType`, дефолт supabase-js — implicit; hash подхватывается автоматически).
  Добавлена no-op-safe страховка `exchangeCodeFromUrl()` (`?code=` → `exchangeCodeForSession`,
  чистка кода из URL) + вызов разово в ините провайдера + 3 теста. Без кода — `null`.
- Правка 1: `resetPassword(email, redirectTo = <origin>/reset-password)` — дефолт внутри
  сервиса; `README.md` — раздел «Supabase Auth: Redirect URLs» (иначе письмо уведёт на
  дефолтный Site URL `localhost:3000`).
- Правка 2: в `toAuthError` проверки `session_missing`/`bad_jwt`/`session_not_found`
  стоят ДО `status === 401`; правило `password` сужено до `weak_password` /
  `password should be` / `password is too short`.
- Смежный фикс: `App.test.tsx` стабит `AuthProvider` passthrough-моком — шелл-тест
  про layout/баннер, реальный провайдер покрыт своим тестом (иначе с unconfigured env
  провайдер кидал бы `getSupabaseClient()` в самом шелл-тесте).
- В БД ничего не применялось.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors (1 warn: `react-refresh/only-export-components` на
  `AuthProvider.tsx` — `useAuth()` рядом с компонентом по плану единицы 3, warn
  допустим конфигом)
- `npm test` — 43/43 (34 старых + 9 новых: 6 провайдер + 3 exchange)

**Осталось**

- Единицы 4–6 по `docs/plan.md` (экраны → роуты/Settings → тесты+журнал).

## 2026-11-03 — Итерация 1.2, единица 4: экраны авторизации закрыта (+ правки из ревью единицы 3)

**Сделано**

- Ревью-правки единицы 3 (коммит `07b02d3`): `AuthProvider` больше не падает без
  `.env.local` — в начале эффекта `if (!isSupabaseConfigured) { setInitialized(true); return; }`
  (+ try/catch вокруг подписки `onAuthStateChange`); результат `await getSession()` не
  применяется, если `lastUserId !== undefined` (событие свежее stale init).
  `AuthProvider.unconfigured.test.tsx` (new): мокает только `@/lib/env` как unconfigured,
  рендерит `<App />` с реальным провайдером, ждёт `role="status"` «Supabase is not connected».
  Смежный фикс: `AuthProvider.test.tsx` мокает `@/lib/env` как configured — иначе тесты
  провайдера зависели бы от локального `.env.local` (та же причина, что фикс `App.test.tsx`
  в единице 2; прод-код не тронут).
- Единица 4, новые файлы: `schemas.ts` (Zod: signIn / signUp / requestReset /
  setNewPassword + инфер-типы), `resolver.ts` (минимальный RHF↔Zod бридж без
  `@hookform/resolvers` — новых зависимостей нет), `AuthControls.tsx` (общие `AuthField`
  с `aria-invalid`/`aria-describedby` и ошибкой в `role="alert"`, `AuthSubmit` с
  `disabled` во время запроса, `AuthAlert` для error/success), `AuthLayout.tsx`
  (центровка + бренд, без сайдбара/мобильной навигации; auth-роуты вне `AppLayout`),
  `SignInPage.tsx`, `SignUpPage.tsx`, `ResetPasswordPage.tsx` (режимы `request` /
  `update` через `initialMode`), `CheckEmailPage.tsx`.
- Тексты — в `*_COPY`-константах рядом со страницами (английский, без хардкода в глубине),
  ошибки берутся по `AuthServiceError.code` через `AUTH_ERROR_MESSAGES`, не по message.
- SignIn: ссылки на регистрацию/сброс, отдельная подсказка + resend при
  `email_not_confirmed`, уведомление об успехе сброса из `location.state`,
  `autoComplete email/current-password`, двойная отправка заблокирована `isSubmitting`.
- SignUp: передаёт `fullName` + `timezone` (api уже умеет); `needsConfirmation` true →
  `/check-email` с email в `location.state`, false → `/`; прямой заход на `/check-email`
  без state → редирект на `/sign-up`.
- CheckEmail: resend с cooldown 60 с (`RESEND_COOLDOWN_SECONDS`, для тестов — проп
  `cooldownSeconds` с тем же дефолтом); одинаковый success-текст для существующего и
  несуществующего адреса, `rate_limited` — отдельное сообщение, ссылка «ко входу».
- Reset: режим 1 — generic success; режим 2 — новый пароль + подтверждение, после
  `updatePassword` → `signOut` → `/sign-in` с флагом; `session_missing` → понятное
  сообщение + возврат к форме запроса письма.
- Роутинг не тронут (`router.tsx` без изменений): страницы рендерятся и тестируются
  изолированно в `MemoryRouter`; подключение — единица 5. В БД ничего не применялось.
- Тесты (только моки Supabase-клиента, без моков `./api`): `schemas.test.ts` (границы),
  RTL на каждую страницу (валидация, ошибка по code, pending/disabled, обе ветки
  confirmation, cooldown, expired-ссылка, редирект без state).

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors (warn `react-refresh/only-export-components` на `*_COPY`
  рядом с компонентами — тот же допустимый паттерн, что `useAuth` в единице 3)
- `npm test` — 75/75 (44 старых + 31 новый: 4 schemas + 27 страницы/layout)
- `npm run build` — ok
- `npx prettier --check` по новым файлам — ok (`api.ts`/`api.test.ts` не трогал:
  их форматирование расходится с prettier ещё с прошлых коммитов)

**Осталось**

- Единицы 5–6 по `docs/plan.md`: защищённые роуты (`RequireAuth`, auth-экраны вне
  `AppLayout`, подключение `AuthLayout` + страниц в `router.tsx`), `OnboardingDialog` /
  `PreferencesForm` / `SettingsPage`, RTL-тесты форм, `e2e/auth.spec.ts`, журнал.

## 2026-11-03 — Репозиторий на GitHub

- Публичный репозиторий: https://github.com/rinatwebric/lifeos (ветка `main`,
  8 коммитов перенесены как есть, без сквоша). `.env.local` в репозитории отсутствует
  (проверено 404 через contents API), секретные ключи только локально.

## 2026-11-03 — Итерация 1.2, единица 5: роуты, защита, Settings, onboarding закрыта

**Сделано**

- Шаг 0: `resendConfirmation` получил дефолт `emailRedirectTo` внутри сервиса
  (`defaultConfirmRedirect()` -> `<origin>/`, письмо больше не уходит на дефолтный
  Site URL `localhost:3000`); плюс тест дефолта. Ожидания `options: undefined`
  в `SignInPage.test.tsx` / `CheckEmailPage.test.tsx` обновлены.
- `src/features/auth/useAuth.ts` (new): `AuthContext` + `useAuth()` + типы вынесены
  из `AuthProvider.tsx` (убран `react-refresh/only-export-components` warn у провайдера).
- `src/features/auth/RequireAuth.tsx` (new): `RequireAuth` (loading — заглушка без
  редиректа, anonymous — `<Navigate to="/sign-in" state={{ from: location }} replace />`)
  и `RedirectIfAuthed` (authenticated — `/`, loading — заглушка). При
  `!isSupabaseConfigured` оба рендерят children (шелл с баннером вместо мёртвого редиректа).
- `src/app/router.tsx`: auth-роуты (`/sign-in`, `/sign-up`, `/check-email`) вне `AppLayout`
  под `AuthLayout` + `RedirectIfAuthed`; `/reset-password` без `RedirectIfAuthed`
  (recovery-ссылка устанавливает сессию — иначе редирект на `/` съедал бы форму):
  `ResetPasswordRoute` выбирает `update` при `authenticated`, `request` при `anonymous`
  (key по статусу, ремаунт после обмена кода). `AppLayout` обёрнут в `RequireAuth`;
  существующие роуты сохранены.
- `SignInPage`: после входа возврат на `state.from.pathname`, иначе `/` (deep link жив).
- `src/features/settings/api.ts` (new): `getProfile`/`updateProfile`/`getPreferences`/
  `updatePreferences`/`markOnboarded` + `profileQueryKey`/`preferencesQueryKey`.
  Identity только из `auth.getUser()` (проверенный JWT), RLS — второй слой;
  маппинг snake_case -> camelCase через `src/types/database.ts`; клиент не делает insert.
- `src/features/settings/schemas.ts` (new): `preferencesFormSchema` (timezone + HH:MM,
  wake != sleep) и `profileFormSchema` (fullName/language/theme) + инфер-типы.
- `src/features/settings/PreferencesForm.tsx` (new): общая форма day setup
  (timezone -> `profiles`, wake/sleep -> `user_preferences`), два update через
  `Promise.allSettled`, раздельные ошибки по таблицам, инвалидация только
  исполненных ключей (не `clear()`), RHF + Zod, aria.
- `src/features/settings/OnboardingDialog.tsx` (new): один шаг, подсказка (не гейт).
  Монтируется из `AppLayout` только при `onboarded_at IS NULL`. Save (через форму)
  и Skip оба пишут `onboarded_at`; Escape = Skip; фокус-трапа нет.
- `src/features/settings/SettingsPage.tsx` (rewrite): email read-only из сессии,
  профиль (full name, language en/ru/ky, theme) + `<PreferencesForm/>` для
  timezone/wake/sleep. Working/study hours — не в этой итерации (Phase 3).
  Состояния loading/error/success по PRD 9.4, retry при ошибке загрузки.
- `src/app/theme.tsx` (new): `applyTheme` (класс `dark` на `<html>` + localStorage),
  `ThemeProvider` синхронизирует `profiles.theme` при входе. `index.html`: inline-скрипт
  до бандла (без вспышки), `providers.tsx`: `QueryClient -> Auth -> Theme`.
  Язык только хранится (`profiles.language`), интерфейс пока английский.
- В БД ничего не применялось (миграции единицы 1 достаточно). Новых зависимостей нет.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors (warns `react-refresh/only-export-components` на COPY-константы
  рядом с компонентами — тот же допустимый паттерн, что в единицах 3–4)
- `npm test` — 100/100 (75 старых + 25 новых: resend-дефолт, 6 guards, 8 settings api
  с маппингом строк, 5 onboarding/AppLayout, 5 settings page)
- `npm run build` — ok
- Точечно: loading не редиректит; anonymous редиректит с `from`; authed видит layout;
  onboarding при `onboarded_at=null`, исчезает после Skip/Escape/Save;
  сохранение инвалидирует `['profile']`/`['preferences']`; частичная ошибка
  показывает, какая таблица не сохранилась; `dark` применяется на `<html>`.

**Осталось**

- Единица 6 по `docs/plan.md`: `e2e/auth.spec.ts` (Playwright, нужен
  `npx playwright install`), финальный журнал. Ручная проверка: два аккаунта
  не видят данные друг друга (RLS), выход очищает кеш, пояс сохраняется.

## 2026-11-04 — Итерация 2, единица 1: схема Phase 2 применена и проверена

**Сделано**

- Решения 2026-11-04 (6/6, в `docs/plan.md`): удаление цели — A (`SET NULL` + диалог
  с числом задач, каскада на `tasks` нет); статусы этапов — `pending | completed`;
  повторения — eager 30 дней + докатка при логине + `UNIQUE (recurrence_rule_id,
  due_date)`; `progress_mode` — тоггл без потери ручного значения; Dashboard —
  блок «Insights» без «AI»; история цели — минимум сейчас, `goal_events` — долг
  в ROADMAP (осознанное расхождение с PRD §3.3).
- Коммит `7086298`: `0003_goals_milestones` + `0004_tasks_recurrence` (тексты),
  `database.ts` (Row-типы + мапперы), `src/lib/recurrence.ts` + 6 unit-тестов
  (чистое разложение правила в даты; `isTaskOverdue` уже был в `dates.ts`).
- Коммит `3741dbc` (3 правки после ревью SQL): кросс-тенантные `EXISTS`-гарды
  в `WITH CHECK` политик insert/update (`milestones`: владение `goal_id`;
  `tasks`: владение `goal_id`/`milestone_id`/`recurrence_rule_id`;
  композитные FK отвергнуты — лишний риск по версии PG); `weekdays`:
  запрет пустого массива при `frequency='weekdays'` + запрет NULL-элементов;
  индексы задач — `(user_id, due_date)` и `(user_id, scheduled_start)` вместо
  одиночного `due_date`. Плюс 3 записи в `ARCHITECTURE.md` §2 (порядок этапов,
  `completed_at`, RLS вместо композитных FK) и закрытый п.1 §7.
- `0005_time_blocks` отложен в Phase 3 (таблице без UI в Phase 2 делать нечего).

**Проверено (БД, проект `lifeos`, Postgres 17.11)**

- Миграции `0003`, `0004` применены через MCP (`apply_migration`), история чистая
  (0001 → 0002 → 0003 → 0004). Структура: 4 таблицы, колонки/типы/дефолты —
  по плану; `relrowsecurity=true` на всех; 16 политик (`*_select/insert/update/
  delete_own`); 4 триггера `set_updated_at()`; все CHECK + FK на месте
  (`milestones.goal_id CASCADE`, `tasks.goal_id/milestone_id/recurrence_rule_id
  SET NULL`, частичный `uq_tasks_recurrence_instance`).
- Живой тест через REST от имени пользователя A (`e2e.lifeos@gmail.com`),
  скрипт в TEMP (в репозиторий не коммитился): 25/25 PASS. Цепочка
  goal → milestone → task; удаление цели → milestone исчез (CASCADE), задача жива
  с `goal_id/milestone_id IS NULL` (SET NULL). Негативы: чужой `user_id` —
  reject, ссылка на несуществующий `goal_id` (insert milestone, relink task) —
  reject, anon — 0 строк везде. Гарды повторений живые: пустые `weekdays` —
  reject, NULL в `weekdays` — reject, дублирующий экземпляр `(rule, date)` — reject.
- Текст `WITH CHECK` политик вычитан из `pg_policies` — `EXISTS`-гарды на месте
  дословно. Пробные строки удалены, таблицы пустые для пользователя A.
- `npm run typecheck` + `lint` (0 errors) + `test` 110/110 (104 старых + 6 новых).

**Осталось**

- Единица 2 по `docs/plan.md`: Goals сервис + хуки (миграции уже живые, моки
  больше не нужны для ручной проверки).
- Ограничение проверки изоляции: один подтверждённый аккаунт; двух-тенантный
  сценарий (B владеет целью, A ссылается) — в e2e единицы 9 / Phase 6 (PRD §19 п.11).

## 2026-11-04 — Итерация 2 ЗАКРЫТА (единица 9: документы, деплой-конфиг, порядок)

**Сделано (единицы 1–6 и 8; код уже был в main, здесь — фиксация)**

- Unit 1 — схема Phase 2 (`7086298` + `3741dbc`, журнал `b0b870f`): `0003_goals_milestones`
  + `0004_tasks_recurrence`, RLS 16 политик (`user_id = auth.uid()`), кросс-тенантные
  `EXISTS`-гарды в `WITH CHECK`, `weekdays`-проверки, индексы `(user_id, due_date)` /
  `(user_id, scheduled_start)`. Живая проверка REST от имени пользователя A — 25/25.
- Unit 2 — Goals сервис + хуки (`2a14c27`): CRUD, `archive/pause/resume/complete`
  как смена статуса + `completed_at`, Zod-схемы, TanStack Query-ключи, `api.test.ts`.
- Unit 3 — Goals UI (`c14e4fd` + правки `2fe3110`): список, форма, статусы,
  удаление с подтверждением («N задач останутся, но потеряют связь с целью»).
- Unit 4 — Goal detail + milestones (`a765736` + правки `ddcb42f`): CRUD этапов,
  позиции (`ORDER BY position, created_at, id`, без UNIQUE), завершение ставит
  `completed_at`, прогресс — `calculateGoalProgress` (режим `milestones` + есть
  этапы → derived, иначе ручное, clamp 0–100).
- Unit 5 — Tasks сервис + хуки (`9e6af78` + правки `2ebfd23`): CRUD,
  `complete/reopen`, `reschedule`, привязки `goal_id/milestone_id`, `countTasksForGoal`
  (канонически в `tasks/api.ts`, реэкспорт из `goals/api.ts`), ошибки через
  `src/lib/dbErrors.ts` (`DbServiceError` + `toDbError`).
- Unit 6 — Tasks UI (`608d161` + правки `dbfed51`): список, фильтры
  (status/priority/goal/search), сортировка, связь с целью, complete-кнопка,
  перенос даты, удаление, reopen.
- Unit 8 — Dashboard на реальных данных (`041b090` + правки `e213fdc`):
  `DashboardPage` + `useDashboardData` (агрегация без запросов в цикле),
  Today's progress (empty state вместо 0% при пустом дне), Today's tasks,
  Active goals, детерминированный блок **Insights** (без «AI» в названии),
  Schedule — честная заглушка «Nothing scheduled yet» до Phase 3.
- Unit 9 (это изменение): `e2e/smoke.spec.ts` — убит протухший ассёрт
  плейсхолдера «Phase 2 — Goals & Tasks» (Goals UI настоящий с Unit 3),
  заменён на кнопку «New goal»; `vercel.json` (SPA-rewrite `/(.*) → /index.html`,
  иначе `/goals/:id` даст 404); `docs/assets/dashboard.png` + `tasks.png`
  (сняты на живых данных скриптом через UI, демо-данные после съёмки удалены);
  `docs/plan.md` — итерация помечена закрытой, Unit 7 вынесен в Phase 2.5;
  `docs/ROADMAP.md` — Phase 2 отмечен выполненным (кроме отложенного);
  README — статус, деплой-секция, скриншоты, «Что работает».

**Решения (приняты 2026-11-04, зафиксированы в `docs/plan.md`)**

1. Удаление цели — `SET NULL` (`tasks.goal_id/milestone_id ON DELETE SET NULL`,
   `milestones.goal_id ON DELETE CASCADE`); каскада на `tasks` нет ни в каком виде;
   диалог показывает число отвязываемых задач (`countTasksForGoal`).
2. Статусы этапов — только `pending | completed` (`MILESTONE_STATUSES`);
   `in_progress` выводится из задач этапа в Planner.
3. Сортировка задач по умолчанию — в памяти (`due_date` asc nulls last, затем ранг
   приоритета `critical > high > medium > low` по явной карте `PRIORITY_RANK`,
   затем `created_at` desc, затем `id`): PostgREST ранжирование не выражает.
   Запрос ограничен `TASK_LIST_LIMIT = 500` (серверная предсортировка + `.limit(500)`);
   дальше — пагинация или серверное view. UI честно пишет «Showing first 500 tasks».
4. Insights — детерминированные строки на реальных числах (overdue, нагрузка дня),
   правилa в коде (`buildInsights`), не модель; слово «AI» в блоке не используется
   (PRD §3.2: пользователя про AI не врём). Чат-ассистент — Phase 4.
5. Сервисное правило «этап без цели»: `createTask` отклоняет связку
   «milestone без goal» ошибкой `validation`; `updateTask` в том же случае молча
   чистит `milestone_id` (отвязка цели не оставляет висячую ссылку).

**Отложено**

- Unit 7 (recurrence UI/сервис) → **Phase 2.5**. Причина: разовые задачи полностью
  закрывают поток «цель → задача → выполнение»; eager-докатка зафиксирована
  решением 3, таблица `recurrence_rules` + чистый `src/lib/recurrence.ts` уже
  в схеме/коде, проводка сервиса и формы — отдельным блоком после деплоя.
- `goal_events` (полноценная история цели) → **Phase 3+** (долг в ROADMAP,
  осознанное расхождение с PRD §3.3). Сейчас в данных есть
  `created_at / updated_at / completed_at`, отдельного блока «История» в UI нет.
- `0005_time_blocks` → Phase 3 (таблице без UI в Phase 2 делать нечего).

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors (13 warnings: `react-refresh/only-export-components`
  на COPY-константах рядом с компонентами + `react-hooks/incompatible-library`
  на `watch()` из RHF — оба допустимы, ошибок нет)
- `npm test` — **267/267** (30 файлов: unit + RTL)
- `npm run build` — ok (`dist/`, 809 kB JS / 230 kB gzip — чанк один, code-splitting
  не настраивался; предупреждение vite о размере, не ошибка)
- Live e2e (реальный Supabase-проект, только anon key, общий e2e-аккаунт,
  по 1 воркеру): **8/8** — auth 4/4 (anon-редирект, вход, persist wake/sleep,
  sign out; 5-й тест sign-up с реальным письмом пропущен сознательно — лимит
  отправок проекта, верифицирован в итерации 1.2), goals 1/1, tasks 1/1,
  dashboard 1/1 (цель + 2 этапа + 2 задачи, тоггл двигает процент), smoke 1/1
  (после фикса протухшего ассёрта).
- Общий e2e-аккаунт после прогонов и скриншотов вычищен (все демо-цели/задачи удалены).

**Осталось**

- Подключить репозиторий в Vercel, выставить env (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` — только anon), добавить прод-домен и `/reset-password`
  в Supabase → Authentication → URL Configuration; проверить живой URL
  (вход → цель → задача → дашборд → reload `/goals/:id` → выход). Детали — в отчёте ниже.
- Unit 7 (Phase 2.5) и Phase 3 (planner) — следующим шагом по `docs/plan.md`.
- `git tag v0.3.0` + push (команда — в задаче Unit 9 п.5).
## 2026-11-04 — Phase 2.5 (повторения) закрыта + политика почты

**Сделано**

- Unit 7 (повторяющиеся задачи), коммит `c4074b2`: `src/features/tasks/recurrence/`
  (`schema`, `errors`, `api`, `hooks`, `queryKeys`, 18 тестов), докатка на `SIGNED_IN` в
  `AuthProvider` через `queueMicrotask` (мимо auth-лока, ошибки только в `console.warn`),
  UI: чекбокс Repeat в `TaskFormDialog` (только режим создания) + бейдж Repeat в `TaskRow`,
  `e2e/recurrence.spec.ts`. Правка экземпляра (`updateTask`) и перенос (`rescheduleTask`)
  отвязывают `recurrence_rule_id = NULL`; `setTaskStatus` связь сохраняет.
- Найденный факт: batch `upsert` с `onConflict: recurrence_rule_id,due_date` невозможен —
  PostgREST не выражает предикат частичного индекса `uq_tasks_recurrence_instance`
  (`WHERE recurrence_rule_id IS NOT NULL`), живой probe даёт `42P10`. Идемпотентность сделана
  как read-then-insert + построчный retry при `23505` от гонки двух устройств; наблюдаемая
  семантика та же (второй вызов = 0 строк).
- Правки по ревью, коммит `9fa5bcf`: «сегодня» в докатке считается в поясе пользователя
  (`toDateKey(now, timeZone)`, а не UTC-дата — при UTC+6 около полуночи создавался вчерашний
  экземпляр); `scheduled_start/end` сдвигаются на дельту дней (раньше будущие экземпляры
  теряли время); якорь серии — `created_at desc` (удаление раннего экземпляра больше не
  выключает генерацию); докатка одним проходом (4 запроса вместо ~5 на правило);
  `assertMilestoneBelongsToGoal` экспортирован из `tasks/api.ts`, дубль с `as unknown as` убран.
  Побочный факт: `Asia/Almaty` сейчас UTC+5, для честного UTC+6 в тестах взят `Asia/Bishkek`.
- **Supabase ограничил дефолтный SMTP проекта** `svbcpjpewzivqifyckkm` (письмо от команды
  Supabase, bounce rate). Причина — e2e-спека регистрации гоняла несуществующие
  `e2e.signup.*@gmail.com`. Ограничение не снимается само: нужен custom SMTP.
- **Решение владельца (2026-11-04):** на время демо `Confirm email = OFF` в Supabase.
  Регистрация работает без письма, `signUp` возвращает сессию; приложение уже поддерживает
  обе ветки (`needsConfirmation = session === null`), правок кода не потребовалось.
  Осознанно принятые последствия: Forgot password, resend confirmation, invite и magic link
  не работают; сброс пароля — только из Dashboard.
- Прод: `https://lifeos-sepia-mu.vercel.app`, деплой готов, env стоят в Production и Preview.
  Rewrites проверены снаружи: `/` и `/goals/:id` отдают SPA (949 байт, `<title>LifeOS`),
  Vercel-404 нет.
- Демо-сев: написан `scripts/seed-demo.mjs` (3 цели, 6 задач, префикс `Demo: `, `--dry-run` /
  `--clean`, только anon key + логин, без `service_role`). Файл пока **не закоммичен**.

**Проверено**

- `npm test` — 289/289 (31 файл), прогнано дважды после правок; `typecheck`, `lint` (0 errors),
  `build` — зелёные.
- `node scripts/seed-demo.mjs --dry-run` — печатает план, БД не трогает; `eslint` + `prettier`
  по файлу чистые.
- e2e после Unit 7 (по отчёту исполнителя): 10/10 — auth, goals, tasks, dashboard, smoke,
  recurrence; у второго экземпляра серии совпадают wall-времена, reload не плодит дублей.

**Осталось**

- Человеку (дашборды): закоммитить сев; создать отдельный демо-аккаунт (не e2e!);
  добавить `VITE_DEMO_*` в Vercel; удалить неподтверждённых пользователей из Users.
- Агенту: итерация 3 в `docs/plan.md` (кнопка демо-входа, гигиена e2e, README/тег `v0.4.0`).
- После демо: custom SMTP (Brevo/Resend) → `Confirm email = ON` → прогнать e2e с реальным
  `E2E_SIGNUP_EMAIL` → почистить пользователей, созданных на демо.

## 2026-11-04 — Итерация 3 Demo readiness ЗАКРЫТА (единицы 1–4) + тег v0.4.0

**Сделано**

- Unit 1 — сев демо-данных, коммит `5416f9d`: `scripts/seed-demo.mjs` (3 цели,
  6 задач, префикс `Demo: `, `--dry-run` / `--clean`, только anon key + логин,
  без `service_role`) + строка про сев в README. Follow-up владельца `e1643ec`:
  сев читает `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` из `.env.local` (тот же
  аккаунт, что кнопка демо-входа), а не `E2E_*` — демо-аккаунт обязан быть
  отдельным от e2e-аккаунта (посетители правят демо, e2e-ассерты стабильны).
- Unit 2 — кнопка демо-входа, коммит `db9e981`: `demoAccount.ts`
  (`getDemoCredentials()` читает `import.meta.env` в момент вызова, `null`
  при пустом значении; `isDemoSignInAvailable()`), `DemoSignInButton.tsx`
  («Explore the demo account», успех → `/`, ошибка → `onError`, `disabled`
  в полёте, без env — `null`), вставка в `SignInPage.tsx`, 5 unit-тестов,
  `.env.example` — закомментированные `VITE_DEMO_*` («public demo account,
  sample data only»). Без хардкода кредов, без `service_role`, без e2e-аккаунта.
- Unit 3 — гигиена e2e, коммит `84d7116`: `auth.spec.ts` больше не гоняет
  фейковые `e2e.signup.*@gmail.com` (bounce → блокировка SMTP) и не ждёт
  «Check your email» (при `Confirm email = OFF` сессия возвращается сразу) —
  регистрация `+`-алиаса из `E2E_SIGNUP_EMAIL`, `test.skip` без него, ожидание
  `/` + «Welcome back»; `recurrence.spec.ts` cleanup: сначала удаление правила
  (`recurrence_rules` через anon-key REST), затем задач — докатка становится
  no-op, цикл «до 12 итераций» удалён. `helpers.ts` экспортирует
  `E2E_SIGNUP_EMAIL`, `.env.e2e.example` документирует его.
- Unit 4 — этот коммит: README — разделы «Demo account» (прод-ссылка, кнопка,
  shared-предупреждение, восстановление сидом) и «Email (demo)» (confirmation
  disabled, password reset requires custom SMTP), статус Phase 2.5 done,
  счётчики (294 теста); `docs/plan.md` — итерация помечена закрытой;
  тег `v0.4.0`.

**Проверено (на каждой единице)**

- `npm run typecheck` — ok; `npm run lint` — 0 errors (14 warnings: известные
  `react-refresh/only-export-components` на COPY-константах + `useAuth`
  (тот же допустимый паттерн) и `react-hooks/incompatible-library` на `watch()`
  из RHF — ошибок нет); `npm test` — 294/294 (289 старых + 5 новых
  `DemoSignInButton`); `npm run build` — ok.
- `node scripts/seed-demo.mjs --dry-run` — печатает план (3 цели, 6 задач),
  БД не трогает; `eslint`/`prettier` по файлу чистые.
- Миграции и RLS не тронуты (запрет итерации): схема не менялась, политик
  не ослаблялось — только код, тесты и документы.

**Осталось**

- Человеку (Vercel/Dashboard): убедиться, что `VITE_DEMO_EMAIL` /
  `VITE_DEMO_PASSWORD` стоят в Production и Preview; создать демо-аккаунт,
  если ещё не создан (не e2e-аккаунт!); прогнать сев; кликнуть кнопку на проде →
  дашборд с демо-данными; удалить неподтверждённых пользователей из Users.
- После демо (отдельная итерация, `docs/plan.md` единица 5): custom SMTP →
  `Confirm email = ON` → удалить демо-пользователей → прогнать e2e с реальным
  `E2E_SIGNUP_EMAIL` → отметить снятие ограничения.
- Дальше — Phase 3 (planner, `0005_time_blocks`, AI — см. ROADMAP).

## 2026-11-04 — Политика почты зафиксирована: Confirm email остаётся OFF

**Решение владельца (после закрытия итерации 3):** подтверждение email не включаем — ни
сейчас, ни после демо. Custom SMTP и `Confirm email = ON` выполняет только владелец и только
по своей прямой просьбе. Единица 5 итерации 3 отменена и помечена в `docs/plan.md`, чтобы
следующий агент её не взял и не начал «готовить» e2e под включённую почту.

**Побочный факт, проверенный живьём:** `POST /auth/v1/recover` с anon key отвечает `HTTP 200 {}`
— Supabase не раскрывает существование аккаунта, но письмо не уходит. Значит `/reset-password`
показывает нейтральное «письмо отправлено» и ведёт в тупик: посетитель демо ждёт письмо,
которого не будет. Ограничение принято владельцем осознанно; честная пометка на странице
сброса (или скрытие ссылки) — открытый вопрос, не входит ни в одну итерацию.
Побочный эффект того же ограничения: `resend confirmation` на `/sign-in` недостижим
(ветка `email_not_confirmed` при OFF не наступает), invite и magic link не работают.

**Что не менялось:** код, миграции, RLS, тесты, e2e — только документы (`docs/plan.md`,
`README.md`, этот журнал), поэтому gate (`typecheck`/`lint`/`test`/`build`) не затронут.
Отдельно зафиксировано: `prettier --check` по `docs/plan.md` и `docs/progress.md` был красным
и **до** этой правки (проверено на версиях из `HEAD` dfbe42a) — исторический долг вёрстки
документов, не регресс этой записи; в gate проекта `format:check` не входит.

## 2026-11-04 — Итерация 4 спланирована (Phase 3 — Planner)

**Сделано:** планировочная сессия, код не писался. В `docs/plan.md` добавлена секция
«Итерация 4 — Phase 3: Planner»: цель, контекст, границы, решения Д1–Д8, 10 единиц
(одна единица = один коммит), проверка итерации, «вне итерации».

**Решения владельца (не пересматривать):**

- Д5 (найдено на ревью плана, до применения миграции): `time_blocks.task_id → tasks(id)`
  — **`ON DELETE CASCADE`**, а не `SET NULL`. `ON DELETE SET NULL` реализуется как UPDATE
  ссылающейся строки, CHECK проверяется на UPDATE, поэтому инвариант «task-блок всегда с
  `task_id`» нарушался бы и удаление задачи с блоком падало бы с `23514`. Плюс симметричный
  `CHECK (task_id IS NULL OR block_type = 'task')`.
- Д1 свободное/отдых выводятся, новых колонок нет; Д2 конфликт = пересечение ∪ сон ∪ прошлое,
  поверх working/study — предупреждение (PRD §4.3 запрета не содержит); Д3 дробления нет;
  Д4 `block_type = task|break|personal` без `source`; Д6 overdue — кандидаты с бустом;
  Д7 без оценки — «нужна оценка», дефолта нет; Д8 Accept зеркалит `scheduled_start/end`,
  **удаление блока обнуляет зеркало**.
- PRD §4.4 (AI) — Phase 4; почта остаётся выключенной бессрочно (в план не входит).

**Проверено:** ссылки плана сверены с кодом и PRD — `domain.ts:97-103` (`TimeBlock.blockType`
= `string`), `database.ts` без строки `time_blocks`, `tasks/api.ts:29,53,104`,
`dates.ts:7,37,123,163`, `0004:105-139` (EXISTS-гарды), `PlannerPage.tsx` (заглушка);
PRD §4.3 (9 входов / 6 ограничений / 5 полей), §11.7 (колонки `time_blocks`), §18 (4 критерия
Planner). Расхождений нет, кроме исправленной Д5.

**Осталось:** единица 1 — файл `0005_time_blocks.sql` + типы (код); применение миграции —
только владелец, отдельной командой, после ревью файла.

## 2026-11-04 — Скилы дизайна установлены в проект (AGENTS.md §8)

**Сделано:** `npx skills add jakubkrehel/skills --skill better-interface better-ui
better-typography better-colors better-accessibility better-layout better-writing interface-review
-a opencode -y --copy` → 8 скилов в `.agents/skills` + `skills-lock.json`, закоммичены вместе с
правилами (иначе у следующего агента их просто нет).

**Почему так, а не «просто скачали»:** скил — это файл с инструкцией; без прямого указания агент
его не открывает (в `docs/*` за всю итерацию не было ни одного упоминания скилов). Поэтому в
`AGENTS.md §8` появился блок «Design skills» с обязательным циклом «открыть → следовать →
назвать в отчёте конкретные применённые правила». Оттуда же убраны фантомные `find-skills` и
`design-taste-frontend` — их нет в `~/.config/opencode/skills`.

**Ревью `1017e18` (единица 3):** 349/349 в 35 файлах, typecheck/lint зелёные. Зеркало задачи
(`scheduled_start/end`) теперь обновляется и при правке блока, а при удалении берётся оставшийся
блок, а не `null`. Остаток, записанный в план единицы 7: relink блока на другую задачу (старое
зеркало у прежней задачи не чистится) — юнит 3 этот случай сознательно не покрывал.

## 2026-11-04 — Дизайн, шаг 1: система токенов и примитивы (`48996e8`)

**Сделано:** `src/index.css` — двухъярусные токены (`--raw-*` → `--color-*`), шкала типографики
(`--text-title/heading/body/ui/caption/micro` с line-height и weight), `--radius-control/card`,
`--shadow-raised/overlay`, `--ease-standard`, `--duration-*`, `--color-scrim`; 11 примитивов в
`src/components/ui/*` переведены на токены. Менялись только классы: тексты, `aria`-атрибуты и
пропсы не тронуты (проверено диффом — в нём только className-строки). Тёмная тема на месте,
старые имена (`bg-surface`, `text-content`, `border-line`, `bg-accent`, `text-accent-content`,
`border-focus`, `text-muted`, `bg-surface-muted`) сохранены 1:1.

**Побочная находка:** из-за preflight-сброса отступов `<dialog>` терял центровку и открывался
в левом верхнем углу — добавлен `m-auto`. Это существовавшая визуальная ошибка, а не следствие
шага 1.

**Проверено (ревью):** typecheck ok, lint 0 errors (14 warnings), 349/349 в 35 файлах, build ok.
Контрасты пересчитаны независимо по WCAG 2 (sRGB). Совпали: content/surface 17.85 / 15.11,
muted/surface-muted тёмная 6.97, accent 17.85, focus 5.17 / 7.01, control 3.80 / 3.28,
danger/surface 6.57, success/surface 5.69, warning/surface 7.52.

**Расхождение в отчёте исполнителя (не влияет на код):** три значения он мерил другой парой
фонов. Фактически muted/surface-muted светлая — **4.76** (а не 4.97), danger тёмная — **6.39**
(а не 6.70), success тёмная — **9.32** (а не 7.79). Все три проходят AA, код не менялся, но запас
`muted` на `surface-muted` тонкий (4.76 при пороге 4.5): при будущей правке этих токенов мерить
именно эту пару.

**Осталось:** шаги 2–3 — оболочка (`components/layout/*`: AppLayout, Sidebar, MobileHeader,
MobileNav, Brand, SetupBanner) и экраны (`features/**`, `AuthLayout`), где ещё остались литералы
`rounded-lg`, `red-*`, `transition-all`, `shadow-[...]`; 44px touch-цели для мелких кнопок
отложены осознанно (меняют раскладку).

## 2026-11-04 — Дизайн, шаг 2: каркас и экраны входа (`8a66a47`)

**Сделано:** 6 файлов каркаса (`AppLayout`, `Sidebar`, `MobileHeader`, `MobileNav`, `Brand`,
`SetupBanner`) и 7 файлов входа (`AuthLayout`, `AuthControls`, `SignIn`, `SignUp`,
`ResetPassword`, `CheckEmail`, `DemoSignInButton`) переведены на токены шага 1; `min-h-dvh`
вместо `min-h-screen`; `viewport-fit=cover` + `pb-[env(safe-area-inset-bottom)]` у нижнего бара;
`scroll-padding` в base (фокус не уезжает под стикер-хром); хит-зоны до 44px (реальный `min-h-11`
в баре, `::after -inset-1` в шапке); подписи навигации с 11px до `text-micro`. Новый
`shellNav.test.tsx` (2 теста).

**Проверено (ревью):** typecheck ok, lint 0 errors (14 warnings), **351/351 в 36 файлах**.
Дифф просмотрен построчно: менялись только className-строки и добавлен тест — ни одна константа
копирайта и ни одно доступное имя не изменены, значит e2e не затронут. Геометрия проверена:
у `main` `pb-28` (112px) против бара 44px + safe-area — контент не перекрывается.

**Две неточности в отчёте исполнителя (код не менялся):**

- `aria-current="page"` у активного пункта **уже** ставился `NavLink` автоматически; новый тест
  фиксирует существующее поведение, а не добавляет его;
- иконка Settings объявлена `strokeWidth={2}` + `absoluteStrokeWidth`, то есть рендерится 2px, а в
  отчёте сказано «ровно 1.5px» — расхождение косметическое.

**Найдено попутно (на шаг 3):** в сайдбаре остался устаревший ярлык «Phase 1 · Foundation».
Ни один тест и ни одна e2e-спека этот текст не проверяют (проверено grep по `src/` и `e2e/`),
значит правка копирайта безопасна и делается вместе с экранами.

**Осталось:** шаг 3 разбит на две единицы: 3a — дашборд и настройки; 3b — цели, задачи,
диалоги, `RequireAuth`-заглушки. После них — возврат к планировщику (единицы 4–7).

## 2026-11-04 — Дизайн, шаг 3a: дашборд и настройки (`e02f0b6`)

**Сделано:** 5 файлов — `DashboardPage`, `SettingsPage`, `PreferencesForm`, `OnboardingDialog`,
`Sidebar` (устаревший ярлык «Phase 1 · Foundation» → «Phase 3 · Planner in progress»). Литералы
`red-*`/`green-*`/`text-xs`/`text-sm` заменены ролями `danger`/`success` и шкалой `text-ui/micro`;
время, проценты и счётчики получили `tabular-nums`; чекбокс задачи обёрнут в `<label>` с
`-m-3.5 p-3.5` (визуал 16px, хит-зона 44×44); `PreferencesForm` переведён на `Field/Input/Button`
(минус ~100 строк ручной разметки), порядок элементов и `aria`-связки сохранены.

**Проверено (ревью):** typecheck ok, lint 0 errors (14 warnings), **351/351 в 36 файлах**, build ok.
В диффе сверил подписи и `aria`: `aria-label` чекбокса на месте, `aria-describedby`/`id` полей
сохранены (тесты настроек и онбординга это подтверждают). Приём с отрицательным `margin` осознан:
он не двигает визуальный размер, только расширяет область нажатия.

**Долг, который нельзя потерять:** e2e за шаги 2 и 3a **не прогонялся** (правило «≥60 минут между
живыми прогонами» из-за Auth rate limit). Прогнать `dashboard + goals + tasks + auth + smoke` в
начале следующей сессии, до закрытия дизайн-прохода.

**Осталось:** шаг 3b — цели, задачи и их диалоги (`GoalFormDialog`, `TaskFormDialog`, `TaskRow`,
`TasksFilters`), `RequireAuth`-заглушки, `NotFoundPage`, плейсхолдеры Analytics/Habits/Planner/
Assistant, 44px для иконок в строках.

## 2026-11-04 — Дизайн, шаг 3b: цели, задачи, диалоги (`8286e1b`) + закрытие дизайн-прохода

**Сделано (20 файлов, +159/−115):** цели и задачи со всеми семью диалогами переведены на токены;
длинные названия — `truncate` + `title` (в `<h1>` деталки — перенос с `break-words`); хит-зоны:
чекбоксы через `<label>`-обёртку, иконки строк через `::after -inset-1`; у строк с двустрочным
контентом `items-start`; в `Button` добавлен аддитивный размер `lg (h-11)` для кнопок диалогов;
`Dialog` ставит фокус на `[data-autofocus]` **после** захвата `previouslyFocused`.

**Проверено (ревью):** typecheck ok, lint 0 errors (14 warnings), **351/351 в 36 файлах**, build ok.
Поведенческое изменение `Dialog` проверено построчно: сначала снимается `previouslyFocused`
(строка 34), только потом фокус уходит внутрь (51) — возврат фокуса на триггер не ломается.
В коде **не осталось** `autoFocus` (grep): все 7 диалогов используют `data-autofocus`, в
деструктивных — на Cancel. Подписи, `aria-label` и порядок узлов не менялись (в диффе только
`className`, добавленные `title` и `data-autofocus`).

**Живой e2e (субагент-верификатор, отдельный прогон):** `auth + smoke + dashboard + goals + tasks`
— **8 passed, 0 failed, 1 skipped** (skip — нет `E2E_SIGNUP_EMAIL` в окружении), 1.4 минуты,
консольных ошибок нет. Регрессий от дизайн-шагов 2–3b не выявлено; долг закрыт.

**Найдено ревью и исправлено отдельно:** в `AuthLayout` остался `min-h-screen` (пропуск шага 2 —
`RequireAuth` при этом уже был на `min-h-dvh`), в `router.tsx` — `text-sm` в состоянии загрузки
сброса пароля. Обе правки — по одной строке.

**Вывод:** дизайн-проход (шаги 1, 2, 3a, 3b) закрыт. Урок в AGENTS §7: перед словом «дизайн
закрыт» — grep на литералы (`rounded-lg|text-xs|text-sm|min-h-screen|red-|green-|transition-all`)
по `src`, иначе хвосты остаются незамеченными.

**Осталось:** итерация 4 — единицы 4–10 (настройки доступного времени → день/неделя → блоки →
превью плана → принятие → дашборд + e2e). Миграция `0005_time_blocks` ждёт применения владельцем.

## 2026-11-04 — Планировщик, единицы 4 и 5 (параллельно, двумя субагентами)

**Как делали:** две независимые единицы запущены одновременно в отдельных `git worktree`
(`lifeos-u4`, `lifeos-u5`), как требует AGENTS §10 — двум агентам нельзя работать в одной папке.
`node_modules` подключён junction-ссылкой на основное дерево, `.env.local` скопирован — установка
зависимостей не понадобилась. Файлы единиц не пересекались (`settings/*` против `planner/*`),
поэтому обе ветки смержились в `main` **без конфликтов**. Выигрыш по времени: ~16 минут вместо ~32.

**Единица 4 — доступное время в настройках (`7bca809`, ветка `feat/planner-unit-4`):**
`src/types/domain.ts` получил `WEEKDAYS`/`Weekday`, `AvailabilityWindow`, `AvailabilityWindows`;
три jsonb-поля `UserPreferences` больше не `Record<string, unknown>`. `settings/api.ts` —
`workingHours`/`studyHours`/`preferredWorkPeriods` в `UpdatePreferencesInput` с маппингом в
snake_case. `settings/schemas.ts` — `availabilityFormSchema` (7 дней, до 6 окон в день,
`start < end`, запрет пересечения, смежные окна разрешены, пустой день = «не задано»).
Новый `AvailabilityForm.tsx` (344 строки) с `reset()` в `useEffect`, раздельными блоками ошибок
загрузки и сохранения, `sr-only`-подписями у плотных полей времени.
`src/lib/planner.ts` — дедупликация типов (`DayKey = Weekday`, `DayInterval = AvailabilityWindow`),
логика не тронута, 28 старых тестов зелёные.

**Единица 5 — дневной экран (`64d6aab`, ветка `feat/planner-unit-5`):**
`usePlannerDay.ts` (605 строк) — чистая `buildPlannerDay()` (модель дня: блоки, свободные окна,
конфликты через `findConflicts`, суммы по типам, шкала в поясе пользователя) + хук с
loading/error/empty; `DayView.tsx` — список блоков с типом, длительностью, отметкой конфликта,
сводка дня, пустое состояние объясняет следующий шаг (PRD §9.4); `PlannerPage.tsx` — настоящий
экран вместо заглушки с навигацией по дням и кнопкой «сегодня». 21 новый тест.

**Проверено в объединённом `main`:** typecheck ok; lint **0 errors, 15 warnings** (было 14 —
добавился один `react-refresh/only-export-components` в `AvailabilityForm.tsx`, тот же класс,
что в остальных файлах с константами); **397 тестов в 40 файлах** (было 351 в 36); build ok.
Оба мержа — `--no-ff`, история единиц сохранена.

**Не проверено (и не может быть):** живые запросы к `time_blocks` — таблицы в базе нет, миграция
`0005` не применена. Всё, что связано с реальными данными дня, проверено только на моках.

**Осталось:** единица 6 (неделя), 7 (ручные блоки + relink-зеркало), 8 (превью плана),
9 (accept/reject), 10 (дашборд + e2e + журнал).

## 2026-11-04 — Планировщик, единицы 6 и 8 (параллельно, двумя субагентами)

**Как делали:** снова две независимые единицы одновременно в отдельных `git worktree`
(`lifeos-u6`, `lifeos-u8`). Единице 8 было явно запрещено трогать `PlannerPage.tsx` — подключение
превью остаётся за единицей 9, поэтому ветки не пересеклись и смержились без конфликтов.

**Единица 6 — недельный экран (`c7d01c2`):** `usePlannerWeek.ts` (342 строки) — `buildPlannerWeek`
(7 дней с понедельника, все расчёты в поясе пользователя) + хук с **одним** запросом на весь
диапазон и группировкой на клиенте (без N+1); `WeekView.tsx` — 7 колонок на широком экране и
список дней друг под другом на 375px, без горизонтального скролла; клик по дню — ссылка на дневной
вид, поэтому работают «назад» и прямые ссылки; `PlannerPage.tsx` — переключатель Day / Week и
`?view=day|week&date=YYYY-MM-DD` в URL. 22 новых теста.

**Единица 8 — предпросмотр плана (`8e98b4e`):** `usePlanPreview.ts` — чистая `buildPlanPreview`
(слоты + «почему» из `explainSlot`, списки «не поместилось» и «нужна оценка», сводка) и хук только
на чтение; `PlanPreview.tsx` — панель предпросмотра, где Accept / Regenerate / Cancel лишь вызывают
переданные колбэки, на экране прямо написано «Nothing is saved until you accept.». Сырые коды
причин (`no-window`, `too-long`) наружу не выводятся. Тест доказывает, что api не вызывается.
20 новых тестов.

**Проверено в объединённом `main`:** typecheck ok; lint 0 errors, 15 warnings; **444 теста в
46 файлах** (было 397 в 40); build ok; литералов (`rounded-lg`, `text-xs`, `text-sm`, `red-*`,
`transition-all`) в новых файлах нет.

**Инцидент и вывод:** `node_modules` рабочих деревьев был подключён junction-ссылкой на основное
дерево. `npm` внутри worktree заменил ссылку настоящей папкой и **опустошил общий `node_modules`** —
gate в `main` упал с `'eslint' is not recognized`. Восстановлено `npm ci` (~45 секунд), после чего
444 теста и build зелёные. Правило добавлено в AGENTS §10: не расшаривать `node_modules` между
деревьями, каждому — своя установка.

**Осталось:** единица 7 (ручные блоки, диалоги, relink-зеркало), 9 (accept/reject на данных),
10 (Dashboard Schedule + `e2e/planner.spec.ts` + журнал). Миграция `0005_time_blocks` всё ещё
не применена — живые запросы к блокам невозможны.

## 2026-11-04 — Планировщик, единица 7: ручные блоки (`e420c71`)

**Сделано:** `TimeBlockDialog.tsx` (создание/правка, wall time через
`localDateTimeToIso`, конфликт/прошлое только с явным чекбоксом «Keep this block at this
time anyway», согласие сбрасывается при любой правке), `DeleteBlockDialog.tsx`,
`blockForm.ts` (адаптер формы + `buildBlockInput`), `blockMessages.ts`
(`collectBlockWarnings` через `findConflicts`, тексты ошибок по кодам), правка
`DayView.tsx` (строки кликабельны через overlay-кнопку `Edit …`). Сервис: `updateBlock`
зеркалит время в задачу, **relink** чистит зеркало у прежней задачи и выставляет у новой
одним батчем; `deleteBlock` обнуляет зеркало (Д8). Сюда же относится зеркало при
создании/правке из единицы 3.

**Проверено:** вместе с карточкой Schedule (следующая запись) — `npm test` 444 → **509
в 53 файлах** (+65 тестов: +7 новых файлов — `TimeBlockDialog/DeleteBlockDialog/blockForm/
blockMessages/ScheduleCard/useDashboardSchedule/useDashboardSchedule.hooks` тесты — плюс
новые кейсы в существующих `api/DayView/PlannerPage/DashboardPage` тестах, включая
relink-зеркало); `typecheck`, `lint` (0 errors), `build` — зелёные.
Живые запросы невозможны: таблицы `time_blocks` в базе нет (миграция `0005` не применена),
покрытие — только моки.

## 2026-11-04 — Dashboard: карточка Schedule (`9d18346`, часть единицы 10)

**Сделано:** `useDashboardSchedule.ts` (чистый `buildDashboardSchedule`: ближайшие 5 блоков
дня, суммы по типам, флаги пустого/прошедшего дня; хук — один запрос блоков на тот же ключ
`planner.range`, задачи только для подписей) + `ScheduleCard.tsx` (скелетон/ошибка/пустые
состояния по PRD §9.4, ссылка «Open planner»). Дашборд читает задачи, а не блоки (Д8),
поэтому карточка не врёт после accept/reject единицы 9.

**Проверено:** см. числа выше (509/53 вместе с единицей 7); `typecheck`, `lint`
(0 errors), `build` — зелёные. На живых данных не проверялась — блоков в базе нет.

## 2026-11-04 — Планировщик, единица 9: accept плана, панель предпросмотра, e2e-спека

**Сделано**

- `api.ts` — `applyPlan(input)`: принимает слоты `{taskId, start, end, title}`,
  создаёт `block_type='task'` блоки и в том же заходе зеркалит `scheduled_start/end`
  через существующий `writeTaskMirrors` (дубля логики нет). Идемпотентность без
  миграции: один запрос существующих пар на спан плана → вставляются только
  отсутствующие; повторный Accept тех же слотов — 0 вставок и 0 записей зеркала.
  Владение задачами — один запрос `tasks` с `in(id)`; identity только из JWT
  (`requireUserId`), RLS не тронут. Пустой план — возврат без запросов.
  Частичный сбой — всегда coded-ошибка (`validation/forbidden/conflict/…`), молча
  ничего не проглатывается.
- `schemas.ts` — `planSlotSchema` / `applyPlanSchema` (+ тип `ApplyPlanInput`):
  конец строго после начала; пустой title допустим — сервис подставит название
  хранимой задачи.
- `hooks.ts` — `useApplyPlan()`: инвалидирует `planner.blocks` (день и неделя) и
  списки/деталки связанных задач; `["goals","list"]` не трогает.
- `PlanSlotEditor.tsx` (new) — только локальные правки: `datetime-local` в поясе
  пользователя, перепроверка конфликтов через `findConflicts` (overlap/sleep/past,
  `work` — нет, как в `TimeBlockDialog`), предупреждение + чекбокс «Keep this plan
  at these times anyway» со сбросом согласия при любом изменении.
- `PlanAcceptPanel.tsx` (new) — монтирует готовый `PlanPreview` (не изменён) на
  слотах из `usePlanPreview`: Generate открывает (только чтения), Regenerate
  сбрасывает правки к computed-предложению, Cancel закрывает без единой записи,
  Accept пишет через `useApplyPlan` и закрывает панель (день обновляется за счёт
  инвалидации). Правки видны в строках превью (время/длительность/«после полуночи»);
  «почему»-предложение не пересчитывается — оно объясняет выбор задачи, а не время.
- `PlannerPage.tsx` — кнопка «Generate plan» + монтирование панели. Остальные тексты
  и доступные имена не тронуты.
- `e2e/planner.spec.ts` (new, живьём НЕ запускалась — базы нет): переключение
  day/week, создание/удаление ручного блока, конфликт только с подтверждением,
  generate → accept и generate → cancel, RLS-негатив через чужой id по образцу
  `scripts/verify-rls.mjs` (второго аккаунта нет, `service_role` не используется).
  RLS-тест скипается без `SUPABASE_URL`/`SUPABASE_ANON_KEY` и без таблицы (проба
  возвращает не-200 до применения `0005`); пример — в `.env.e2e.example`.

**Проверено (фактические числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, **16 warnings** (15 известных + 1 новый
  `react-refresh/only-export-components` в `PlanSlotEditor.tsx` — тот же допустимый
  класс: константы/типы рядом с компонентом)
- `npm test` — **531/531 в 57 файлах** (было 509 в 53; +22: `applyPlan.test.ts` — 10,
  `useApplyPlan.test.tsx` — 3, `PlanAcceptPanel.test.tsx` — 8, `PlanGenerate.test.tsx` — 1)
- `npm run build` — ok
- grep по `src/`: `rounded-lg|text-xs|text-sm|red-*|green-*|transition-all|min-h-screen` —
  чисто (только токены + `src/components/ui`)
- Ключевые доказательства тестами: Cancel и правка слота до Accept — ни одного
  вызывающего запись мока (`applyPlan/createBlock/updateBlock/deleteBlock` — 0 вызовов);
  повторный Accept тех же слотов — `insert` не вызывается, зеркало не пишется, результат
  `{blocks: [], mirroredTaskIds: []}`; конфликтный Accept без чекбокса не пишет, после
  правки согласие сбрасывается.

**Известное ограничение (не баг этой единицы, чинится будущей RPC):** батч зеркала —
два параллельных запроса, не транзакция. Если вставка блоков прошла, а запись зеркала
упала, `applyPlan` бросает coded-ошибку, но блоки остаются в БД, а `scheduled_start/end`
задачи — старые: возможна рассинхронизация «блок есть, зеркала нет». Лечится будущей
RPC (атомарные вставка + зеркало); до неё рассинхронизация видна глазами (блок в дне,
но не в задаче) и чинится повторным Accept — он идемпотентен и допишет зеркало.

**Осталось / блокирует живая проверка (история до применения 0005)**

- Миграция `0005_time_blocks` НЕ применена (таблицы в живой базе нет): живьём не
  проверено ничего из этой единицы; все покрытия — моки. `e2e/planner.spec.ts` не
  запускалась и до применения `0005` запускаться не должна.
- Сразу после применения `0005`, по порядку: 1) `node scripts/verify-rls.mjs` (RLS на
  новой таблице); 2) `npm run test:e2e -- planner.spec.ts` (или полный `npm run test:e2e`);
  3) вручную на двух аккаунтах: generate → accept виден в дне, reject ничего не пишет,
  чужой `user_id` недоступен. 4) Живой повторный Accept того же плана — второй прогон
  не создаёт дублей (проверяется числом строк).

## 2026-11-04 — Итерация 4: живая проверка (миграция применена, e2e заблокирован — НЕ ЗАКРЫТА)

**Статус: итерация НЕ закрыта.** Продуктовый код не менялся (`src/**` нетронут).
Миграция `0005_time_blocks` применена как трекаемая (`apply_migration`,
name `0005_time_blocks`, SQL файла дословно, SHA256 `008be8e…4ee55`).
Живой e2e вскрыл баг пустого дня — закрытие заблокировано до правки кода
(правка запрещена этой задачей, только описание).

**Phase 1 — файл и применение**

- Файл `supabase/migrations/0005_time_blocks.sql` прочитан целиком (65 строк):
  совпадает с ожидаемым — `create table time_blocks`, FK `user_id → auth.users(id)
  on delete cascade`, FK `task_id → tasks(id) on delete cascade`, 3 индекса,
  триггер `trg_time_blocks_updated_at → set_updated_at()`, `enable RLS`,
  4 политики `*_own` с `EXISTS`-гардом владения `task_id` (образец 0004).
  Уточнение счёта: CHECK-ограничений фактически 4 (тип, интервал, 2 на связку
  тип↔задача), а не 3 — в задаче связка посчитана как один пункт.
- Применение: `tools.supabase.apply_migration({name: "0005_time_blocks", query})`
  → `{success: true}`. Предсостояние было чистым: `to_regclass → null`,
  `pg_policies → 0`, история только 0001–0004.

**Phase 1 — доказательства схемы (7 пунктов)**

- `to_regclass('public.time_blocks')` → `time_blocks` (не null).
- `pg_policies` по `time_blocks` → ровно 4: `select/insert/update/delete own`
  (`time_blocks_select_own`, `time_blocks_insert_own`, `time_blocks_update_own`,
  `time_blocks_delete_own`).
- `pg_constraint` → 4 CHECK (`block_type in (…)`, `end_time > start_time`,
  `block_type <> 'task' OR task_id IS NOT NULL`, `task_id IS NULL OR block_type='task'`)
  + `PRIMARY KEY (id)` + 2 FK (`task_id → tasks(id) CASCADE`,
  `user_id → auth.users(id) CASCADE`).
- `pg_indexes` → 3 кастомных (`idx_time_blocks_user_id`,
  `idx_time_blocks_user_start`, `idx_time_blocks_task_id`) + `time_blocks_pkey`.
- `relrowsecurity` → `true` (`relforcerowsecurity=false`).
- Триггер `trg_time_blocks_updated_at` существует (не internal).
- История `schema_migrations` содержит `0005`:
  `20261104122353 | 0005_time_blocks` после 0001–0004.

**Phase 2.4 — `node scripts/verify-rls.mjs` (целиком)**

- Скрипт проверяет только `profiles`/`user_preferences` (покрытия `time_blocks`
  в нём нет) — 11/11 PASS:
  `select profiles 0 rows`, `select user_preferences 0 rows`,
  `sign-in as user A (de42c19d-…​)`, `select own profiles 1 row`,
  `select own preferences 1 row`, `foreign profile 0`, `foreign prefs 0`,
  `update foreign profile 0`, `update foreign prefs 0`,
  `update own 1 row`, `restore 1 row` → `RLS verification: ALL CHECKS PASSED`.
- RLS `time_blocks` этим скриптом не покрыта; доказана ниже REST-пробами
  (foreign select 0, foreign insert 403).

**Phase 2.5 — живой e2e (ОДИН прогон, больше не запускать до +1 часа)**

- Команда: `npx playwright test e2e/planner.spec.ts --reporter=list`.
- Итог: **4 failed, 1 skipped, 0 passed** (1 worker, chromium).
  Длительности: ~17.2с / 14.6с / 14.6с / 16.1с (+ перезапуск dev-сервера).
- Пропуск: `planner rls: foreign user_id is invisible` — skip, т.к. в `.env.e2e`
  нет `SUPABASE_URL`/`SUPABASE_ANON_KEY` (только `E2E_*`), по дизайну спеки.
- Все 4 падения — одна причина, дословно:
  `Error: expect(locator).toBeVisible() failed / Locator: getByText('Day summary')
  / Expected: visible / Timeout: 5000ms / Error: element(s) not found`
  в `openDay` (`e2e/planner.spec.ts:56:47`), вызвано из `87:1`, `106:1`, `119:1`,
  `155:1` (day/week, manual break, overlap-confirm, generate→accept/cancel).
- Артефакты: скриншотов/trace нет (конфиг: `trace: on-first-retry`, `retries: 0`);
  только `test-results/<spec>-chromium/error-context.md` (4 шт.).
  Консольных `pageerror` спека не собирает (слушателя нет).
- Корень (код не правлен): `DayView.tsx:174-185` — пустой день рендерит
  `EmptyState «Nothing planned for this day»` без `Day summary`;
  `Day summary` есть только при `!isEmpty`. А `openDay` ждёт `Day summary` всегда,
  поэтому падает на чистых датах (`+3…+7` дней). Error-context подтверждает:
  страница показывает `Nothing planned…`, а не `Day summary`.
  Это баг спеки/контракта пустого дня (тест ждёт сводку, которой нет по дизайну),
  а не схемы: таблица и RLS живые (см. ниже).

**Phase 2.6 — двойной Accept (UI заблокирован e2e-багом; доказано REST-симуляцией логики `applyPlan`)**

- Живьём через REST от имени e2e-пользователя (`de42c19d-…`): созданы задачи A/B,
  вставлены 2 `task`-блока на `2026-11-10` (`09:00–09:30`, `10:00–10:30`) + зеркала
  `scheduled_start/end` (первый Accept).
- `count(*)` блоков за день до второго Accept: **2**; существующих пар в спане —
  2/2, `missing = 0` → второй вызов эквивалентен `{blocks: [], mirroredTaskIds: []}`.
  `count(*)` после: **2** (не изменился).
- Отсутствие пар-дублей SQL: `select task_id, start_time, count(*) … group by 1,2
  having count(*) > 1` → **0 строк**; клиентский пересчёт дублей → 0;
  `select count(*) from time_blocks` после чистки → 0, `tasks where title like
  'LIVE check%'` → 0 (мусор удалён).

**Phase 2.7 — ручные проверки по PRD §18 (таблица «пункт → результат»)**

- Конфликт только после явного подтверждения — **НЕ проверено живьём**
  (e2e-тест `overlap … only after confirmation` упал в `openDay` до шагов конфликта).
  Код существует (`TimeBlockDialog` чекбокс `Keep this block…`), покрытие — только моки.
- Блок в прошлом / в часах сна — предупреждение, а не молчаливый отказ —
  **НЕ проверено живьём** (те же причины; `collectBlockWarnings`/`PlanSlotEditor`
  только на моках).
- Удаление блока обнуляет `scheduled_start/end` у задачи — **проверено живьём
  через REST** (симуляция `deleteBlock`): после `DELETE time_blocks` + зеркало-`PATCH`
  задача A → `{scheduled_start: null, scheduled_end: null}`. UI-кнопка Delete
  живьём не нажата (e2e заблокирован).
- Удаление задачи с блоком удаляет только блок (Д5), сосед не затронут —
  **проверено живьём**: `DELETE tasks B` → `time_blocks where task_id=B` = `[]`,
  сосед A жив (`tasks id=A` на месте). Каскад `ON DELETE CASCADE` работает.
- Чужой `user_id` недоступен — **проверено живьём**: `select … user_id=FOREIGN`
  от имени A → `200, []` (0 строк); `insert {user_id: FOREIGN}` → `403`
  `42501 new row violates row-level security policy for table "time_blocks"`.

**Что осталось проверенным только на моках (не закрыто)**

- Весь UI Planner: day/week переключение, ручной блок, конфликт с подтверждением,
  generate → accept/cancel через кнопки, предупреждения прошлое/сон, `PlanPreview`.
  Живой UI-путь заблокирован багом `openDay`/`DayView`-empty (см. выше).
- `scripts/verify-rls.mjs` не покрывает `time_blocks`; RLS новой таблицы доказана
  только точечными REST-пробами этой записи, а не скриптом.
- Ограничения из плана (не баги этой проверки): батч зеркала — два параллельных
  запроса, не транзакция (частичный сбой оставляет блоки без зеркала, лечится
  повторным идемпотентным Accept); микросекундная точность `timestamptz` опирается
  на усечение через `Date.parse` (ключ `taskId|startMs|endMs`).

## 2026-11-04 — Итерация 4 ЗАКРЫТА (e2e-гонка входа устранена, полный прогон зелёный)

**Статус: итерация закрыта.** Продуктовый код не менялся (`src/**` нетронут, тексты
интерфейса те же). Два коммита: `a21771f` (детерминированный вход) и этот (документы).
`npm run typecheck` — ok, `eslint` по изменённым e2e-файлам — чисто. Не пушилось.

**Что чинил `a21771f` (две гонки одного семейства — доверие переходному состоянию)**

1. Гонка из `1feec2b` (регресс `auth.spec`, НЕ предсуществующее падение): после
   `goto("/")` документ ещё на `/`, а `RequireAuth` уводит на `/sign-in` уже после.
   Ассёрт `toHaveURL(/\/$|\/sign-in$/)` + чтение `page.url()` принимали «ещё `/`»
   за «уже авторизован» — хелпер возвращался, не заполнив форму. Доказано кодом
   (`helpers.ts:33-38`, `RequireAuth.tsx`: loading → placeholder, затем `Navigate`).
   Лечение: после `goto("/")` ждём `expect(signInForm.or(shellAnchor)).toBeVisible()`
   (поле `Email` ЛИБО навигация шелла `Primary`), URL не читаем; виден якорь —
   возврат, иначе заполняем форму и ждём якорь шелла, а не URL. Заголовок
   `Welcome back` якорем быть не может — он одинаков на `/sign-in` и дашборде.
2. Вспышка протухшей сессии (поймана живьём при починке №1): тест sign-out выходит
   ГЛОБАЛЬНО (`auth.signOut()` по дефолту `scope: "global"` — подтверждено кодом
   `GoTrueClient.signOut`, `@supabase/auth-js`), сервер отзывает все refresh-токены,
   включая сохранённый в `e2e/.auth/state.json`. Следующие спеки видели шелл,
   вспыхнувший по ещё парсящемуся access-JWT (`shell=true` в отладочном логе при
   мёртвой сессии), хелпер возвращался — и тут же улетал на `/sign-in`. Лечение
   в два слоя: (а) liveness-проверка — waiter первого `GET /rest/v1/profiles`
   взводится ДО `goto("/")`, ранний возврат только при статусе 200 (нуль лишних
   запросов — наблюдаем собственный read приложения); иначе — честный вход через
   форму; (б) sign-out тест в конце входит заново (`force`) и перезаписывает
   `state.json`, чтобы последователи reuse'или живую сессию. Остальные спеки без
   `force`: входов сверх `global-setup` + `auth.spec` они не делают.

Дополнительно по ходу: ассёрт `auth.spec` `toHaveValue("06:30:00")` устарел после
`4e4e395` (`toWallTime` режет DB-формат `HH:MM:SS` до строгого `HH:MM` формы) —
обновлён на `"06:30"`/`"22:45"` с правкой комментария (персистентность, а не формат,
и есть предмет проверки).

**Проверено (числа)**

- `npm run test:e2e` (полный, один воркер, chromium): **14 passed, 1 skipped**
  (~2.5 мин). Skip — только sign-up (`E2E_SIGNUP_EMAIL` не задан).
- `npx playwright test e2e/auth.spec.ts` дважды подряд: **4 passed, 1 skipped**
  оба раза (36.5 с / 36.2 с) — флака нет, а не «повезло».
- Минимальное воспроизведение отравления (`-g "sign out returns|create and delete
  a goal"`): до фикса — goals падал на `/sign-in`-снапшоте, после — 2 passed.

**Живые доказательства закрытия (дополняют запись выше)**

- Схема `time_blocks` и ровно 4 политики — из предыдущей записи, без изменений.
- RLS-негатив: UI-тест `planner rls` ЗЕЛЁНЫЙ в полном прогоне (чужой `user_id`
  невидим), не skip — `SUPABASE_URL`/`SUPABASE_ANON_KEY` на месте.
- Двойной Accept без дублей: REST-симуляция логики `applyPlan` (см. выше) +
  UI `generate → accept` живьём в полном прогоне.
- Каскад Д5 (`DELETE tasks B` удаляет только её блоки) — REST-доказательство выше.
- UI живьём в полном прогоне: day/week через URL, ручной блок + удаление,
  overlap только с подтверждением, `generate → accept` пишет блоки + зеркало,
  `generate → cancel` ничего не пишет.

**Урок в методику:** фикстуры и ожидания e2e должны повторять формат БД, а не формы:
PostgREST отдаёт `timestamptz` с `"+00:00"` и `time` как `"HH:MM:SS"`, а формы и
`toWallTime` говорят `"HH:MM"`. Ассёрт на DB-формат в контроле формы — ложное
падение при первой же нормализации на границе.

**Осталось (не закрыто)**

- Ручные проверки PRD §18 на втором аккаунте (изоляция RLS глазами, не скриптом):
  generate → accept виден в дне, reject ничего не пишет; предупреждения
  прошлое/сон и конфликтное подтверждение — кликами, не только ассёртами.
- `scripts/verify-rls.mjs` по-прежнему не покрывает `time_blocks` (доказана
  точечными пробами + UI-тестом выше, а не скриптом).
- Ограничения из плана (см. `docs/plan.md`): зеркало — два параллельных запроса,
  не транзакция; точность `timestamptz` через усечение `Date.parse`.

## 2026-11-04 — Итерация 4.1: закрытие находок ревью Phase 3

**Сделано (коммиты `91e5ed1`, `adcbb49`, `c19966a`, `0276a0f`, `0c1c7a8`, `ce15e02`,
`d2010f3` + этот):**

- B1: повторная генерация плана больше не дублирует задачи. `planDay` исключает
  задачи с task-блоком в этот день (границы — локальная полночь, не сутки UTC)
  и возвращает их в `alreadyPlanned`; превью показывает группу «Already in your
  plan» с локальным временем блока; `applyPlan` берёт `dateKey`/`timeZone`,
  пропускает такие слоты и сообщает ими в `skippedTaskIds` (скип, не conflict —
  как у идемпотентных exact-пар). Панель передаёт день (`ce15e02` — ниже).
- S1: Accept перепроверяет пересечения на сервере через `findConflicts`
  (только `overlap`; sleep/past — клиентские варнинги, `work` — soft по Д2).
  Пересечение без согласия — coded `conflict`; `allowConflicts` несёт согласие
  чекбокса панели. RLS и схема не тронуты, новых запросов нет.
- S2: заголовок превью называет день («Plan for …» в поясе пользователя) —
  минимальный вариант вместо скрытия кнопки в week view.
- D1: ROADMAP Phase 3 — `[x]`; README — Phase 3 done, следующий шаг Phase 4,
  Schedule — карточка на реальных блоках (без вранья про заглушку). Тег не ставился.
- Панель больше не закрывается молча при пустом Accept (`ce15e02`):
  `blocks.length === 0` + есть скипы → `role="status"`
  «These tasks are already in your plan — nothing new was saved.»; закрытие —
  только когда записан хотя бы один блок.
- Копия `conflict` нейтральна для обоих сценариев (`d2010f3`):
  «This time overlaps a block that is already there. Adjust the times, or
  confirm the overlap and accept again.» Коды ошибок не менялись.
- Этот коммит: честные числа в README (563 теста, planner в списке live e2e)
  и эта запись.

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы:
  `react-refresh/only-export-components`, `react-hooks/incompatible-library`)
- `npm test` — **563/563 в 58 файлах** (560 на `0c1c7a8` + 3 новых: 2 панель,
  1 копия конфликта)
- `npm run build` — ok
- `e2e` **НЕ запускался**: rate limit общего Supabase-аккаунта (правило —
  не чаще раза в час и не больше одного прогона за сессию).

**Осталось (требует владельца)**

- Возможный дубль блока через границу суток — на решение владельца
  (день считается по локальной полуночи; слоты, перетёкшие за полночь
  правками, — отдельный кейс, не покрыт).
- `scripts/verify-rls.mjs` по-прежнему не покрывает `time_blocks`.
- Тег `v0.5.0` — ставит владелец после приёмки.

## 2026-11-04 — Итерация 5: ревью-фиксы tool layer (A) + validate (шаг 5, B)

**Сделано (два коммита, один шаг = один коммит)**

- A `fix(ai): correct weekly window and reuse domain rules`
  (`supabase/functions/ai-assistant/tools.ts`, `tools.test.ts`, `deno.json`):
  1) недельное окно закрыто с обеих сторон — `[todayKey − 7, todayKey]`
  (раньше только `due_date >= cutoff`, задачи со сроком в 2030-м попадали
  в weekly и занижали процент);
  2) порядок вычислений: сначала timezone из `profiles`, затем `todayKey`
  в этом поясе (`toDateKey` из `src/lib/dates.ts`), затем cutoff как
  операция над date-key (`shiftDateKey`) — раньше cutoff считался от UTC
  до резолва пояса (сдвиг на сутки при UTC+13/+14);
  3) вместо выборки 201 строки + агрегата в памяти — два count-запроса
  `select("id", { count: "exact", head: true })` (total `neq cancelled`,
  completed `eq completed` в закрытом окне): усечения нет вообще,
  процент точен при любом размере окна;
  4) дубли удалены: `calculateCompletionRate` из `src/lib/progress.ts`,
  `isTaskOverdue` из `src/lib/dates.ts` (плюс `toDateKey` оттуда же);
  `deno.json` получил алиасы `@/lib/aiProposals`, `@/lib/dates`,
  `@/lib/planner`, `@/lib/progress` (Deno резолвит их в `src/`,
  Vitest — через Vite-алиас `@`).
- B — шаг 5 из `docs/plan-phase-4.md`: `validate.ts` + `validate.test.ts`
  (чистая проверка каждого действия до применения, записей нет):
  `validateActions(actions, context) -> {ok:true} | {ok:false, index, code,
  message}`, 10 кодов §16. Расписание — только через `findConflicts`
  из `src/lib/planner.ts` (касание рёбер не конфликт, `work` — soft и
  игнорируется); даты/стены — через `toDateKey`/`toWallTime` из
  `src/lib/dates.ts`, закрытые статусы — через `isTaskClosed` из
  `src/types/domain.ts`. Без N+1: один запрос на набор id сущности
  (`goals`/`milestones`/`tasks` через `in`) + один запрос блоков на
  union-спан черновиков; контекст (`client`, `now`, `timeZone`,
  `wake/sleep`, `working/studyHours`) снаружи, `new Date()` внутри нет.
  Отклонение от плана зафиксировано в `docs/plan-phase-4.md`: чужой id
  под RLS-клиентом читается как отсутствующий → `missing_*`
  (план говорил `forbidden`); `forbidden` — ошибки хранилища (fail closed)
  и неподдерживаемые enum.
- Документы: `docs/plan-phase-4.md` — статус шага 5 + поправка тестовой
  строки §5; эта запись.

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы)
- `npm test` — **643/643 в 66 файлах** (было 627 в 65 после A: +16 новых
  `validate.test.ts`; A: 624 → 627 — новые кейсы окна/UTC+13/усечения/parity)
- `npm run build` — ok
- `grep -n "utcDateKey\|completionRate\|isOverdue" tools.ts` — только поле
  интерфейса и вызов импортированной функции, локальных дублей нет;
  `grep -n "findConflicts" validate.ts` — один импорт + один вызов;
  `new Date()` в `validate.ts` — только в комментарии.

**Не проверено живьём (требует владельца)**

- Миграция 0006 НЕ применена, функция НЕ задеплоена — живые вызовы
  `ai-assistant` невозможны; все покрытия шагов A/B — фейковый клиент
  под Vitest, без сети и без ключа (ключа у исполнителя нет и не было).
- Дальше — шаг 6 из `docs/plan-phase-4.md` (frontend-сервис чата
  `src/features/assistant/*`); `src/features/**` и
  `supabase/migrations/**` в этих коммитах не тронуты.

## 2026-11-04 — Итерация 5, шаг 6: frontend-сервис ассистента (без UI)

**Сделано (один коммит, этот)**

- Новые файлы `src/features/assistant/` (UI нет, только сервис — шаг 8 отдельно):
  `schemas.ts` (`sendMessageSchema`: message trim 1–4000, `conversationId`
  uuid|null), `errors.ts` (`AssistantServiceError` + `ASSISTANT_ERROR_MESSAGES`),
  `api.ts` (`listConversations`, `listMessages`, `sendMessage`),
  `queryKeys.ts` (фабрика `assistant.*` в стиле `planner/queryKeys.ts`),
  `hooks.ts` (`useConversations`, `useMessages`, `useSendMessage`),
  `api.test.ts` + `hooks.test.tsx` (моки supabase-клиента как в
  `planner/api.test.ts`).
- `sendMessage` вызывает `supabase.functions.invoke("ai-assistant", { body })`
  с телом только `{ message, conversationId }` — никакого `user_id` в
  аргументах и теле (identity из `auth.getSession()`, Authorization
  подставляется самим supabase-js). Ответ типизирован
  `{ conversationId, userMessageId, assistantMessageId, proposalId, proposal }`;
  предложение перепроверено `assistantProposalSchema` перед возвратом
  (сервер уже валидировал, клиент мусор не рендерит).
- `useSendMessage` инвалидирует только `assistant.conversations` +
  `assistant.messages(conversationId)`; `["goals","list"]` и `["tasks",...]`
  не трогает (предложение ещё не применено — применение в шаге 7).
- Отклонение от текста шага 6 в `docs/plan-phase-4.md`: `createConversation` /
  `deleteConversation` не добавлялись — диалог создаёт сервер на первом
  `sendMessage`, удаление истории уходит в шаг 8 вместе с UI.
- `supabase/**`, `src/lib/**`, edge-функция не тронуты; новых зависимостей
  нет; секретов во frontend нет (`AI_API_KEY` появляется только в окружении
  функции).

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы:
  `react-refresh/only-export-components`, `react-hooks/incompatible-library`)
- `npm test` — **657/657 в 68 файлах** (было 643 в 66 после шага 5: +14 новых —
  10 `api.test.ts`, 4 `hooks.test.tsx`)
- `npm run build` — ok
- `grep -rn "user_id" src/features/assistant/` — только колонка в `.eq()`,
  комментарии и тестовые ассёрты отсутствия в теле invoke; аргументов
  `user_id` нет; `grep Authorization|VITE_|service_role|AI_API_KEY` — только
  комментарий «не подменять Authorization» и тест-строки (секретов нет)

**Не проверено живьём (облако не настроено, живых прогонов не было)**

- Миграция 0006 НЕ применена в облаке, функция НЕ задеплоена (состояние на
  HEAD шага 5: REST 404 PGRST205, POST `/functions/v1/ai-assistant` 404) —
  живые вызовы невозможны; все покрытия шага — моки клиента под Vitest.
- Живого ключа у исполнителя нет и не использовался; тесты только с моками.

**Осталось**

- Дальше — шаг 7 из `docs/plan-phase-4.md` (apply/reject предложений с
  серверной перепроверкой: ветки approve/reject в edge-функции,
  `useApproveProposal`/`useRejectProposal`, идемпотентность). После него —
  шаг 8 (UI: `AssistantPage`, `ChatPanel`, `ProposalModal`).
- Владельцу: применить миграцию 0006 и задеплоить функцию отдельной командой
  после ревью (как 0005); живой прогон chat → proposal возможен только после
  этого и только с ключом провайдера (иначе stub с честным баннером).

## 2026-11-04 — Итерация 5, шаг 7: apply/reject с серверной перепроверкой (+ invalid_input)

**Сделано (два коммита, один шаг = один коммит)**

- `3ae7139` fix(ai): `invalid_input` в сервисе ассистента — пустой/длинный
  `message` и кривой `conversationId`/`proposalId` дают код `invalid_input`
  с путём поля в `details` (раньше `unknown`); текст в
  `ASSISTANT_ERROR_MESSAGES`; тест поправлен (ассёрты кода и `details`).
- Этот коммит feat(ai): approve/reject с серверной перепроверкой.
  Edge Function (та же `ai-assistant`, дискриминатор `action` в теле;
  отсутствие `action` = chat, обратная совместимость; роутинг — peek через
  `req.clone()`, `handleChat` не тронут):
  - `supabase/functions/ai-assistant/request.ts` — `parseDecideRequestBody`
    (`approve`|`reject` + UUID `proposalId`, те же `too_large`/`invalid_json`/
    `invalid_schema`) + 4 теста.
  - `supabase/functions/ai-assistant/index.ts` — `handleDecision` (auth/лимиты
    как в chat, без rate limit) → `handleApprove`/`handleReject`:
    чтение `ai_proposals` user-scoped клиентом (чужой id → 404 `not_found`);
    не-`pending` → 409 `already_decided` (повторный approve НЕ noop —
    отклонение от текста шага, повторный reject идемпотентен 200);
    `expires_at` в прошлом → 410 `expired` (в БД не пишется, Р3);
    затем `validateActions(actions, context)` с контекстом из собственных
    чтений (`user_preferences` + `profiles.timezone`, дефолты
    `07:00`/`23:00`/`UTC`/`{}`) — ДО первой записи, ошибка → 422
    `validation_failed` `{index, actionCode}` и НИЧЕГО не записано;
    затем применение по порядку тем же user-scoped клиентом (никакого
    `service_role`): `create_goal` → insert goals, `create_milestone` →
    insert milestones (`position` max+1), `complete_milestone` →
    `completed + completed_at`, `create_task` → insert tasks,
    `reschedule_task` → `due_date` + `recurrence_rule_id = null` (как
    `rescheduleTask`), `schedule_blocks` → insert `time_blocks`
    (`block_type='task'`) + зеркало `scheduled_start/end` в задачу (Д8),
    точная пара `(task_id,start,end)` сверяется по инстантам — read-then-
    insert; `update_preferences` → update `user_preferences`/`profiles`
    только по ненуллевым полям. `applied_at` — только после всех записей;
    частичный сбой → 500 `apply_failed` `{applied, total}`, предложение
    остаётся `pending` (повтор может создать дубли — известное ограничение,
    бэклог: RPC `apply_proposal` (атомарно), миграция 0007). Аудит: одна
    строка `ai_messages` `role='assistant'` с `metadata`
    `{proposalId, applied, rejected}` без секретов и без тела предложения.
  - Frontend: `schemas.ts` — `proposalIdSchema`; `api.ts` —
    `approveProposal`/`rejectProposal` через `functions.invoke`
    (тот же контракт ошибок, что у `sendMessage`); `hooks.ts` —
    `useApproveProposal`/`useRejectProposal`. Инвалидация: после approve —
    `assistant.proposals()` + `assistant.messages(conversationId)` +
    `["tasks"]` + `["goals"]` + `planner.blocks`; после reject — только
    `assistant.*`. Тесты: `api.test.ts` +5 (успех без `user_id`,
    `invalid_input` до сети, `invalid_response`, `forbidden` без сессии),
    `hooks.test.tsx` +2 (approve трогает tasks/goals/planner, reject —
    только assistant).
  - `docs/plan-phase-4.md` — статус шага 7 (включая отклонения: approve-повтор
    409, а не noop; дат-колонки через `toDateOnly`; `position` max+1).

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы:
  `react-refresh/only-export-components`, `react-hooks/incompatible-library`)
- `npm test` — **668/668 в 68 файлах** (было 657 в 68 после шага 6 и фикса:
  +4 `request.test.ts` decide, +5 `api.test.ts` approve/reject, +2
  `hooks.test.tsx` инвалидация)
- `npm run build` — ok
- `service_role` в `supabase/functions/ai-assistant/` — только комментарии
  (`index.ts` шапка + RLS-комментарий, `README.md` строка про user-scoped);
  `validateActions` в `index.ts` — импорт + один вызов до первой записи
  (все записи — внутри `applyAction`, зовётся только после валидации)

**Не проверено живьём (облако не настроено, живых прогонов не было)**

- Миграция 0006 НЕ применена в облаке, функция НЕ задеплоена (состояние как
  на шаге 6: REST 404 PGRST205, POST `/functions/v1/ai-assistant` 404) —
  живые вызовы невозможны; все покрытия шага — моки клиента под Vitest и
  чистые модули (`request`/`validate`); Deno-рантайм edge-функции локально
  не поднимался, живого ключа у исполнителя нет и не использовался.

**Осталось**

- Дальше — шаг 8 из `docs/plan-phase-4.md` (UI: `AssistantPage`,
  `ChatPanel`, `ProposalModal` с accept-all/per-action/reject и ручной
  правкой до approve).
- Владельцу: применить миграцию 0006 и задеплоить функцию отдельной командой
  после ревью (как 0005); живой прогон chat → proposal → approve возможен
  только после этого и только с ключом провайдера (иначе stub с честным
  баннером).

## 2026-11-04 — Итерация 5, фикс гонки approve (сериализация решений)

**Сделано (один коммит)**

- `supabase/functions/ai-assistant/approve.ts` (new) + `approve.test.ts` (new):
  чистый claim-модуль без Deno-зависимостей (Vitest): `claimProposal`
  (`UPDATE ... SET approved + applied_at WHERE id + user_id + status='pending' +
  select`, 0 строк → `already_decided`) и `releaseClaim` (откат в
  `pending`/`applied_at=null`). Тесты: «два параллельных approve применяют
  действия один раз» (Promise.all двух claim — ровно один winner, apply
  вызывается один раз) и «откат возвращает pending при сбое посреди apply»
  (claim → сбой второго действия → release → `pending`/null) + повторный claim
  после отката.
- `supabase/functions/ai-assistant/index.ts`: `handleApprove` — валидация ДО
  claim (422 без записи), затем claim, затем apply по порядку; при сбое apply —
  откат и 500 `apply_failed`; финальный `UPDATE approved` удалён (claim уже
  выставил); `schedule_blocks` дедуп с диапазоном `.gt end_time` / `.lt
  start_time` (меньше строк читается, точная пара сверяется по инстантам как
  раньше); шапка про частичный сбой обновлена.
- `src/features/assistant/hooks.ts`: `goals.all` вместо хардкода `["goals"]`
  (значение то же, ключ теперь из фабрики как `tasks.all`/`planner.blocks`).
- `docs/plan-phase-4.md`: записано «в apply до 2 запросов на действие
  (`create_milestone`: position), осознанно» и «410 expired терминален для UI».

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы)
- `npm test` — **671/671 в 69 файлах** (было 668/68 после шага 7: +3 новых
  `approve.test.ts`)
- `npm run build` — ok

**Не проверено живьём**

- Миграция 0006 НЕ применена, функция НЕ задеплоена — живые вызовы
  невозможны; claim проверен фейковым клиентом с атомарным compare-and-swap,
  не живой БД.

## 2026-11-04 — Итерация 5, шаг 8 часть 1: assistant chat UI

**Сделано (один коммит)**

- `src/features/assistant/AssistantPage.tsx`: заглушка заменена реальным
  экраном (`PageHeader` + честная копия «Nothing changes until you review and
  confirm», без «AI»-обещаний).
- `src/features/assistant/ChatPanel.tsx` (new): список диалогов
  (`useConversations`) + лента (`useMessages`) + composer (`textarea`,
  Ctrl/Cmd+Enter, disabled на пустом и >4000, счётчик `n / 4000`); состояния
  loading (skeleton), empty («Ask about your week, or ask for a plan.» +
  3 примера §6.2), error (текст из `AssistantServiceError` + Retry),
  `rate_limited` — «50 messages, resets tomorrow»; disabled при отправке;
  после успеха сообщение приходит из инвалидации (без оптимистичных вставок).
  Токены только, `min-h-11` touch targets, mobile-first.
- `src/features/assistant/ChatPanel.test.tsx` (new, 5 тестов): empty, отправка,
  disabled/counter, rate_limited текст, disabled при отправке.
- `docs/plan-phase-4.md`: статус части 1 (чат), модалка — следующим коммитом.

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы)
- `npm test` — **676/676 в 70 файлах** (было 671/69: +5 новых `ChatPanel`)
- `npm run build` — ok
- `grep rounded-lg|text-xs|text-sm|min-h-screen|red-|green-|transition-all src/features/assistant/` — CLEAN

**Не проверено живьём**

- Миграция 0006 НЕ применена, функция НЕ задеплоена — UI проверен на моках;
  живого ключа нет и не использовался.

## 2026-11-04 — Итерация 5, шаг 8 часть 2: proposal review modal

**Сделано (один коммит)**

- Контракт per-item: `parseDecideRequestBody` принимает
  `selectedIndexes?: number[]` (approve only, non-empty, целые ≥0, без дублей,
  sorted); `handleApprove` валидирует диапазон `0..len-1` (400 при нарушении),
  фильтрует через `selectActionsByIndexes` (тестируемо в `approve.ts`),
  валидирует только выбранные (индекс маппится в оригинальный для 422),
  `applied/total` считает по выбранным; без поля — все действия (обратная
  совместимость). `selectActionsByIndexes` покрыт edge-тестами.
- Frontend: `schemas.ts` — `selectedIndexesSchema`; `api.ts` —
  `approveProposal(id, selectedIndexes?)` (shape до сети → `invalid_input`,
  500 decide → `apply_failed`); `hooks.ts` — `useApproveProposal` принимает
  `string | {proposalId, selectedIndexes?}` (старые вызовы работают);
  `errors.ts` — коды `already_decided/expired/validation_failed/apply_failed`
  + маппинг 400/409/410/422 (+ `apply_failed` по серверному коду или 500 decide).
- UI: `describeAction.ts` (человеческий язык, время в поясе пользователя) +
  `ProposalActionRow.tsx` (чекбокс + описание) + `ProposalModal.tsx`
  (`role="dialog"` нативный, `data-autofocus` на Reject, Escape закрывает,
  фокус возвращается; Accept all → все индексы, Accept selected → подмножество,
  Reject; 409/410/422/500 в модалке, 410 терминален без Retry).
  `ChatPanel` показывает «Review proposal» у последнего pending и монтирует
  модалку. Ручная правка (Р5) НЕ входит — решение 8.1 в `plan-phase-4.md`.
- Тесты: `ProposalModal.test.tsx` (5: accept all, per-item, reject, expired
  терминален, 409/422 тексты); `api.test.ts` +4 (subset body, invalid до сети,
  409/410/422 маппинг, 500→apply_failed); `request.test.ts` +2 (subset ok,
  7 плохих форм); `approve.test.ts` +3 (фильтрация/совместимость/range);
  `hooks.test.tsx` +1 (subset passthrough); `ChatPanel.test.tsx` починен
  (полный `SendMessageResult` + моки decide-хуков).

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы)
- `npm test` — **691/691 в 71 файле** (было 676/70: +5 модалка, +4 api,
  +2 request, +3 approve-фильтр, +1 hooks; ChatPanel остаётся 5)
- `npm run build` — ok
- `grep rounded-lg|text-xs|text-sm|min-h-screen|red-|green-|transition-all src/features/assistant/` — CLEAN

**Не проверено живьём**

- Миграция 0006 НЕ применена, функция НЕ задеплоена — UI и claim проверены
  моками/фейками; живого ключа нет и не использовался.
- Дальше — шаг 9 (weekly review, e2e на stub, документы).

## 2026-11-04 — Итерация 5, ревью-фикс шага 8 (selection reset + честный статус)

**Сделано (один коммит)**

- `ChatPanel.tsx`: `ProposalModal` получил `key={lastProposal.proposalId}` —
  состояние чекбоксов не переживает смену предложения; добавлен
  `decisionNotice` (`role="status"`): после approve — «Applied N of M
  actions.» из результата `approveProposal`, после reject — «Rejected. Nothing
  was changed.»; сбрасывается при новой отправке.
- `ProposalModal.tsx:104,175-177`: честная формулировка — применяются только
  отмеченные, неотмеченные отбрасываются вместе с предложением (не «stay
  untouched»); описание и футер обновлены.
- Тест «a second proposal starts fully selected» (`ProposalModal.test.tsx`):
  A с 3 действиями, снять галку, заменить на B с 5 действиями — все 5
  отмечены, счётчик 5 (проверяет remount по key).
- `ChatPanel.test.tsx`: +2 теста статуса approve/reject (approve с
  `Applied 2 of 2`, reject с `Rejected…`, сброс при новой отправке).
- `docs/plan-phase-4.md`: окно claim→apply (краш оставляет
  `approved+applied_at` без данных, повтор запрещён 409) и бэклог 0007 RPC
  `apply_proposal`.

**Проверено (числа)**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors, 16 warnings (те же известные классы)
- `npm test` — **694/694 в 71 файле** (было 691/71: +1 key-reset, +2 статуса)
- `npm run build` — ok
## 2026-11-04 — AI-помощник: живой прогон, CORS и разбор ответа модели

**Сделано**

- CORS. Функция не отвечала на `OPTIONS` и не отдавала `Access-Control-Allow-Origin`, поэтому
  браузер выбрасывал ответ, а приложение показывало «Network error» (сервер при этом работал).
  Добавлен `cors.ts`, заголовки во все ответы (включая 4xx/5xx), preflight → 204 (`3f1f08c`).
- Экран ошибки маршрута. Дефолтный React Router показывал стектрейс и «Hey developer»; добавлен
  `RouteErrorPage` + `errorElement` на обоих корневых маршрутах (`6e986b5`).
- Разбор ответа модели. Модель иногда отдаёт JSON в ```json-обёртке или с текстом вокруг —
  `JSON.parse` падал, пользователь видел 502 «temporarily unavailable». Добавлен
  `extractJsonPayload` (fence → raw → срез по скобкам) и таймаут 25 → 45 с.
- UI. Ответ без действий больше не дублирует summary и не предлагает «Review proposal»:
  это текст, а не предложение.

**Проверено**

- `typecheck` ok, `lint` 0 errors / 16 warnings, **701/701 в 73 файлах**, `build` ok.
- Живьём: модель отвечает по-русски; stub-ответ; accept 2 из 2 → задачи появились в Tasks.

**Осталось**

- 429/таймаут провайдера всё ещё маппится в общий `ai_unavailable` — нужен отдельный код,
  чтобы UI мог сказать «модель занята, повторите».
- Ротация ключа после демо + обновить `AI_API_KEY` в Supabase.
## 2026-11-04 — Итерация 5 закрыта: Phase 4 (AI Assistant)

**Живое подтверждение (этот репозиторий, не песочница)**

- `OPTIONS /functions/v1/ai-assistant` → **204** + `access-control-allow-origin: *` — CORS на месте.
- `GET /rest/v1/ai_proposals` анон-ключом → **200 []** — таблица есть, RLS закрывает anon.
- `POST /functions/v1/ai-assistant` без токена → **401** — функция задеплоена, JWT обязателен.
- Владелец прошёл сценарий: чат по-русски → предложение → Accept → задачи в Tasks.
- Stub-режим проверен отдельно: ответ «Stub plan…», accept 2 из 2.

**Что вошло в фазу**

Шаги 1–8: миграция `0006` (3 таблицы, 11 политик), типы и мапперы, `src/lib/aiProposals.ts`
(Zod + JSON Schema), Edge Function (провайдер-независимый слой stub/openai-compatible, CORS,
лимит 50 сообщений/24 ч, лимит тела, tool context), `validate.ts` (серверная проверка каждого
действия), approve/reject с claim-откатом и `selectedIndexes`, frontend-сервис и чат с окном ревью.

**Хотфиксы после живого прогона**

- `3f1f08c` — CORS: preflight 204 и заголовки во всех ответах (без них браузер отдавал «Network error»).
- `6e986b5` — `RouteErrorPage` вместо стектрейса React Router.
- `1e83a83` — разбор ответа модели (```json-обёртка, текст вокруг), таймаут 25 → 45 с,
  ответы без действий больше не предлагают «Review proposal».

**Проверки**: typecheck ok, lint 0 errors / 16 warnings, **701/701 в 73 файлах**, build ok.

**Осталось (Phase 4.1)**

- e2e на stub для PRD §19 пп. 9–10 (approve/reject) — не написан;
- ручная правка предложения до approve (Р5) — отложена, нужна серверная ре-валидация;
- 429 и таймаут провайдера маппятся в общий `ai_unavailable` — нужен отдельный код;
- тег `v0.5.0` — за владельцем после приёмки; ротация ключа после демо.

## 2026-11-05 — Phase 5, шаг 1: контракт данных habits (на ревью, миграция НЕ применена)

**Сделано**

- `docs/plan-phase-5.md` (new): план всей Phase 5 — данные → чистые расчёты и
  сервисы → Habits UI → Analytics/weekly review → финальная проверка; критерии
  приёмки каждого шага; зафиксированная семантика для шага 2 (daily/weekdays —
  `target_count` на запланированный день; weekly — сумма за календарную неделю;
  сегодня/текущая неделя — не пропуск; незапланированные дни не ломают streak;
  периоды без запланированного — не 0%; pause/archive не удаляют логи) и
  открытый долг про прошлые паузы/смены расписания (`status` исторический
  календарь не восстанавливает; минимальный вариант — `habit_schedule_versions`,
  отдельным шагом после Phase 5, не часть приёмки).
- `supabase/migrations/0007_habits_habit_logs.sql` (new, текст в git,
  **к живой БД не применялась**): `habits` (frequency daily/weekdays/weekly,
  weekdays `0=Sunday..6=Saturday` как в 0004, пустой список при weekdays —
  reject, NULL-элементы — reject, `target_count >= 1`, `reminder_time TIME
  nullable`, `start_date DATE`, status active/paused/archived) + `habit_logs`
  (`completed_count >= 0`, `UNIQUE (habit_id, log_date)`, `habit_id ON DELETE
  CASCADE`); индексы `(user_id)`, `(user_id, status)`, `(user_id, log_date)`;
  триггеры `set_updated_at()`; RLS 8 политик, на INSERT/UPDATE логов —
  `EXISTS`-гард владения `habit_id`; без `SECURITY DEFINER`.
- Номер `0007` — следующий фактически свободный (`0001–0006` существуют).
  В `docs/plan-phase-4.md` номер `0007` упомянут для будущего AI RPC
  (`apply_proposal` атомарно), но файла нет: `0007` занимают привычки, backlog
  AI RPC при реализации обязан взять `0008+`. AI-код не тронут.
- `src/types/database.ts`: `HabitsRow`/`HabitLogsRow` + `mapHabitRowToHabit` /
  `mapHabitLogRowToHabitLog` в существующем стиле. `src/types/domain.ts` не
  менялся — `Habit`/`HabitLog` уже точно описывают схему.
- `src/features/habits/schemas.ts` + `schemas.test.ts` (new, 19 тестов):
  частоты, статусы (только active/paused/archived), weekdays (границы,
  нецелые, NULL, пустой только не для weekdays), целые количества
  (`target >= 1`, `completed >= 0`, ноль и перевыполнение разрешены),
  настоящие календарные даты (`2026-02-30` — reject с «Use YYYY-MM-DD.»),
  optional/null (`description`/`reminderTime`/`note`), `HH:MM`-формат
  напоминания; `userId` не принимается ни в одной схеме (тест на strip).
- `src/types/habitMappers.test.ts` (new, 4 теста): мапперы по образцу
  `aiMappers.test.ts`, включая nullables.
- `docs/plan.md`: указатель переведён на Phase 5 / `docs/plan-phase-5.md`,
  история итераций сохранена.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors / 16 warnings (те же классы, что в baseline;
  новых warnings от файлов шага нет)
- `npm test` — **724/724 в 75 файлах** (baseline 701/73: +19 схем +4 мапперов)
- `npm run build` — ok
- `git diff --check` — чист; TDD-цикл соблюдён (тесты написаны до кода,
  падение подтверждено: schemas — unresolved import, мапперы — not a function)
- Живая БД не тронута: SQL-проверки на живой БД не выполнялись и не
  заявляются (миграция ждёт внешнего ревью).

**Осталось**

- Внешнее code review этого шага; затем применение `0007` владельцем
  отдельной командой + живая проверка RLS (инструкция — в отчёте сессии).
- Шаги 2–5 по `docs/plan-phase-5.md` (расчёты/сервисы → UI → Analytics →
  финальная проверка).

## 2026-11-05 — Phase 5, шаг 1: fix-ревью (потолок int4, противоречие §3)

**Сделано**

- `src/features/habits/schemas.ts`: общая экспортируемая константа
  `MAX_SQL_INTEGER = 2 ** 31 - 1` + переиспользуемые `targetCountField` /
  `completedCountField` во всех четырёх схемах (create/update привычки и лога;
  update лога наследует лимит через существующий `.omit().partial()` без
  дублирования). Перевыполнение относительно `targetCount` разрешено —
  потолок про тип колонки, не про продуктовое правило.
- `src/features/habits/schemas.test.ts` (+2 теста, 21 в файле): max
  принимается / max+1 отклоняется — все 4 схемы; нецелые значения в обеих
  update-схемах; проверки минимумов сохранены.
- `docs/plan-phase-5.md`: Р3 уточнён (технический потолок вместо «границы
  нет»); §3 п. 6 переписан — исключение дней пауз и пересчёт истории после
  смен расписания требуют решения владельца до шага 2 (варианты A/B — в
  отчёте сессии), до решения действует только forward-only; п. 4 с оговоркой
  про историю; шаг 2 помечен (patch валидируется после объединения со stored
  row — Zod update-схема одна кросс-поле со stored не ловит); §5 — история
  ждёт решения, Phase 5 готовой при невыполненных требованиях PRD §5 не
  называть; статус-шапка обновлена.
- `docs/plan.md`: указатель — fix-коммит на повторном ревью.
- TDD соблюдён: RED (max+1 проходил — 2 failed по правильной причине),
  GREEN (25/25 с мапперами).
- `prettier --check`: статус не изменился — те же 3 файла красные до и после
  (проверено через `git stash`: перенос `.toBe(\n false,\n)` из исходного
  коммита + CRLF-checkout при `end_of_line = lf`; в gate проекта
  `format:check` не входит). Новых классов нарушений не добавлено;
  `schemas.ts` — prettier-clean.
- Живая БД не тронута, шаг 2 не начат, сервис не реализовывался.

**Проверено**

- `npm run typecheck` — ok
- `npm run lint` — 0 errors / 16 warnings (те же классы, новых нет)
- `npm test` — **726/726 в 75 файлах** (+2 граничных к 724)
- `npm run build` — ok
- `git diff --check` — чист

**Осталось**

- Повторное внешнее ревью; решение владельца A/B (см. отчёт сессии);
  применение `0007` владельцем; затем шаг 2 по `docs/plan-phase-5.md`.
