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
  + `user` + `session` через `useAuth()`. Кеш чистится на `SIGNED_OUT` и при смене `user.id`
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
