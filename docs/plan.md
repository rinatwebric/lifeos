# План текущей итерации

Обновляется перед каждой задачей. Выполненные пункты уезжают в `docs/progress.md`.
Формат: один шаг = один коммит = одна проверяемая единица работы.

## Итерация 1.2 — Auth, профиль, настройки времени (Phase 1)

**Цель:** пользователь может зарегистрироваться, войти, выйти и попасть на Dashboard со своим профилем;
все данные закрыты RLS.

### Неоднозначности, требующие решения

1. Подтверждение email включено в проекте Supabase или нет? От этого зависит экран «проверьте почту».
2. Нужен ли onboarding-визард (часовой пояс + время сна/пробуждения) сразу после регистрации,
   или эти поля редактируются в Settings? В PRD Scenario A визард подразумевается.

### Шаги

1. **Миграция `0001_profiles.sql`** — таблица `profiles` (id → auth.users, full_name, avatar_url,
   timezone, language, theme, created_at, updated_at), триггер `handle_new_user`, RLS-политики
   select/update только для своей строки.
2. **Миграция `0002_user_preferences.sql`** — `user_preferences` (wake_up_time, sleep_time,
   working_hours, study_hours, preferred_work_periods, notification_preferences), уникальность по
   `user_id`, RLS по `user_id`.
3. **Типы** — `src/types/domain.ts`: `Profile`, `UserPreferences`; `src/types/database.ts` (Database type).
4. **Auth-сервис** — `src/features/auth/api.ts`: `signUp`, `signIn`, `signOut`, `resetPassword`,
   `getSession`, `onAuthStateChange`.
5. **Провайдер сессии** — `src/features/auth/AuthProvider.tsx` + `useAuth()`; подписка на смену сессии,
   инвалидация TanStack Query при выходе.
6. **Экраны** — `/sign-in`, `/sign-up`, `/reset-password` (React Hook Form + Zod), loading/error/success.
7. **Защищённые роуты** — `RequireAuth` / `RedirectIfAuthed`; при отсутствии сессии редирект на `/sign-in`.
8. **Settings** — редактирование профиля и предпочтений (часовой пояс по умолчанию из браузера,
   тема light/dark через класс на `<html>`).
9. **Тесты** — RTL на валидацию форм; unit на маппинг ошибок Supabase; e2e: регистрация → вход → выход.

### Проверка

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Плюс ручная проверка: два аккаунта не видят данные друг друга (RLS), выход очищает кеш запросов,
часовой пояс сохраняется и используется в Dashboard.

### Вне этой итерации

Goals/Tasks CRUD (Phase 2), Planner (Phase 3), AI (Phase 4).
