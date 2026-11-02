# LifeOS

Персональная операционная система для целей, задач, планирования и прогресса.

> LifeOS should adapt to your life, not force your life to adapt to a schedule.

## Статус

**Phase 1 — Foundation.** Готовы: структура проекта, роутинг, layout с адаптивной навигацией,
дизайн-токены, доменные типы, утилиты прогресса и time-zone-aware overdue с unit-тестами.
Следующий шаг: подключение Supabase Auth + профиль пользователя (см. [docs/ROADMAP.md](docs/ROADMAP.md)).

Полное техническое задание — [docs/PRD.md](docs/PRD.md).
Архитектурные решения — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Требования

- Node.js **>= 22.12** (проверено на 24.x)
- npm 11+
- Аккаунт Supabase (для auth и данных)

## Быстрый старт

```bash
npm install
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
npm run dev
```

Откройте http://localhost:5173. Пока `.env.local` не заполнен, приложение показывает
баннер «Supabase is not connected» — это ожидаемое поведение, а не ошибка.

### Переменные окружения

| Переменная               | Где взять                         | Примечание                                        |
| ------------------------ | --------------------------------- | ------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase → Project Settings → API | Публичный URL проекта                             |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Публичный anon key, безопасен только вместе с RLS |

`service_role` key и ключи AI-провайдеров **никогда** не попадают во frontend.

## Скрипты

| Команда                           | Что делает                                  |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Vite dev server                             |
| `npm run build`                   | Type-check (`tsc -b`) + production build    |
| `npm run preview`                 | Просмотр production сборки                  |
| `npm run typecheck`               | Только проверка типов                       |
| `npm run lint` / `lint:fix`       | ESLint (flat config)                        |
| `npm run format` / `format:check` | Prettier                                    |
| `npm test` / `test:watch`         | Vitest (unit)                               |
| `npm run test:e2e`                | Playwright (нужен `npx playwright install`) |

## Структура

```
src/
  app/          роутер, провайдеры, навигация
  components/   ui/ (примитивы), layout/ (sidebar, mobile nav, banner)
  features/     dashboard, goals, tasks, planner, habits, analytics, assistant, settings
  lib/          supabase client, env, dates, progress, cn
  types/        доменные типы и enum-константы
  test/         setup для Vitest
e2e/            Playwright тесты
docs/           PRD, архитектура, роадмап
.opencode/      проектные скилы для opencode
```

Правила слоёв и запреты — в [AGENTS.md](AGENTS.md) и [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Скилы opencode

Глобальные скилы лежат в `~/.config/opencode/skills` и автоматически доступны во всех проектах.
Для LifeOS дополнительно установлены:

| Скил                               | Зачем                                        |
| ---------------------------------- | -------------------------------------------- |
| `vercel-react-best-practices`      | React 19 / производительность / паттерны     |
| `vercel-composition-patterns`      | Композиция компонентов без лишних абстракций |
| `web-design-guidelines`            | UI/UX ревью интерфейса                       |
| `deploy-to-vercel`                 | Деплой frontend на Vercel                    |
| `writing-guidelines`               | Тексты интерфейса и документации             |
| `supabase`                         | Auth, RLS, клиент, edge functions            |
| `supabase-postgres-best-practices` | Схема, индексы, RLS-политики, миграции       |
| `lifeos-workflow` (проектный)      | Порядок работы над задачами LifeOS           |

## Безопасность

- RLS включён на каждой пользовательской таблице; доступ только к `auth.uid()`.
- Все даты хранятся в UTC, отображаются в часовом поясе пользователя.
- Просроченная задача — вычисляемое состояние, а не статус в БД.
- AI только предлагает изменения; применение — после подтверждения пользователем.
