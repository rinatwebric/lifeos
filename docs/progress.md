# Журнал прогресса

Состояние проекта живёт в файлах и Git, а не в памяти модели. Каждая запись — дата, что сделано,
чем проверено, что осталось.

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
