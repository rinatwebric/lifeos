# План текущей итерации

Обновляется перед каждой задачей. Выполненные пункты уезжают в `docs/progress.md`.
Формат: один шаг = один коммит = одна проверяемая единица работы.

## Итерация 1.2 — Auth, профиль, настройки времени (Phase 1)

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

- Единицы 1–5 закрыты (коммиты `70c8811`, `23da785`, `2646201`, `27dbfd4`, `fc89f96`;
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
   Статус: единица 5 закрыта. Роуты + RequireAuth/RedirectIfAuthed (loading без редиректа, anonymous -> /sign-in с from, authed -> /), useAuth в отдельном файле, resendConfirmation с дефолтом emailRedirectTo=<origin>/, Settings (профиль + day setup: два update с раздельными ошибками, инвалидация ключей), тема (profiles.theme + localStorage + inline-скрипт в index.html), OnboardingDialog (Save/Skip пишут onboarded_at, Escape=Skip, без фокус-трапа). Тесты 100/100 (75 старых + 25 новых: guards, settings api, onboarding, settings page).
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
