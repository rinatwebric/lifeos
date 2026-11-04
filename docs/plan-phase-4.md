# План итерации 5 — Phase 4: AI Assistant (план, код не писать)

> Статус: план. Реализация — отдельными сессиями по одному шагу = один коммит.
> Миграция из шага 1 текстом в git, применение — отдельной командой владельца после ревью (как 0005).
> Файл создан из `C:\Users\user\Desktop\LifeOs` — worktree `LifeOs-phase4` (c71c60e) в этой среде отсутствует.

## 1. Требование своими словами + ссылки на PRD

AI-ассистент помогает управлять целями/задачами/расписанием, но ничего не меняет сам:
пользователь пишет сообщение → backend собирает только разрешённый контекст → провайдер-независимый
слой возвращает структурированный ответ → backend проверяет каждое действие → frontend показывает
предложение как превью → пользователь принимает всё / по одному / отклоняет / правит вручную.
До подтверждения данные неизменны. Секреты только в Edge Function. Почта/SMTP выключены бессрочно.

Покрытие PRD:

- §6.1–6.2 — возможности: breakdown цели, задачи из этапов, анализ прогресса, перегруз, коррекции, анализ невыполненных, weekly review; примеры «frontend in 6 months», «sick this week», «why no progress».
- §6.3 — архитектура: 10 шагов (сообщение → frontend → backend → auth → данные → контекст → AI → structured → проверка → показ → approve).
- §6.4 — tool layer: `get_user_goals`, `get_user_tasks`, `get_weekly_progress`, `get_user_preferences`, `suggest_goal_breakdown`, `suggest_task_creation`, `suggest_schedule`, `suggest_schedule_changes`, `analyze_productivity`. Чтение — только данные владельца; изменение — только предложениями.
- §6.5 — structured output + пример `schedule_suggestion`; backend проверяет каждое действие: задача существует, принадлежит пользователю, статус допустим, дата корректна, нет конфликта расписания.
- §6.6 — human approval обязателен: delete задач/целей, смена дедлайнов, перенос, завершение этапов, смена настроек. Пользователь видит diff до подтверждения.
- §6.7 — история: conversation id, user id, сообщения, роль, дата, метаданные; без секретов в контексте; новый диалог + удаление истории.
- §4.4 — AI Schedule Optimization: перенос, порядок, разбиение большой задачи, снижение нагрузки, перенос некритичных; превью accept-all / per-item / reject / ручная правка; исходное расписание неизменно.
- §11.10–11.12 — таблицы `ai_conversations` / `ai_messages` / `ai_proposals` (в ROADMAP — §11.8–11.10 по старой нумерации); статусы `Pending, Approved, Rejected, Expired`; §11.13 — FK, индексы, CHECK, RLS.
- §13 — логические контракты `POST /ai/chat`, `POST /ai/analyze`, `POST /ai/proposals/:id/approve|reject` (реализация — через Edge Function + Supabase SDK с RLS, отдельного REST-сервера не заводим).
- §16 — ошибки: нет сети, auth, истёкшая сессия, БД, формы, AI API, лимит запросов, некорректный JSON от AI, несуществующая задача, гонка правок, конфликт расписания, нет времени, удалённая цель. Ошибки не ведут к потере данных.
- §18 AI — acceptance: только разрешённый контекст, нет прямого SQL, ответы валидируются, некорректные не применяются, изменения только после approve; Security: RLS, принадлежность записей, без секретов во frontend, чужой аккаунт недоступен; UI: loading/empty/error.
- §19 пп. 9–10 — e2e reject/approve предложений; п. 11 — чужие данные запрещены.
- §17 Phase 4, §22 пп. 3–4, 9–10 — AI предлагает/человек решает, без выдуманных цифр, объяснение «почему», обратимость где технически возможна.
- §21 — вне MVP: голос, автопилот без подтверждения, сложные предиктивные модели.

Границы (AGENTS.md §5–§7, ARCHITECTURE §1–4, решения итерации 4 Д1–Д8):

- AI никогда не пишет в БД напрямую — только фиксированный tool layer + proposals (§5).
- Никаких деструктивных действий без явного согласия (delete / reschedule / deadline) (§5, §6.6).
- Секреты (`service_role`, AI-ключ) только в окружении Edge Function; ничего в `VITE_*` и git (§5, §12.3).
- RLS не ослаблять; `security definer` без отдельного ревью не добавлять (§5).
- Схема — только файлами `supabase/migrations/NNNN_*.sql`; типы домена в том же коммите (§6).
- Параллельно правится planner (повторная генерация плана): Phase 4 зависит только от публичного контракта planner — `src/features/planner/api.ts` (`listBlocks`, `createBlock`, `updateBlock`, `deleteBlock`, `applyPlan` + входные типы), `src/features/planner/schemas.ts`, чистый `src/lib/planner.ts` (сигнатуры `findConflicts`/`scoreSlot`/`explainSlot`). Внутренностям `usePlanPreview`, `PlanGenerate`, `PlanPreview` доверять нельзя.
- Почта/SMTP, magic link, resend — не закладывать (решение итерации 3, бессрочно).
- Слово «AI» только в assistant/Dashboard-Insights через реальные данные; детерминированные хинты Dashboard не трогать.

## 2. Вопросы владельцу (PRD чего-то не определяет — решения нет, нужен ответ)

1. Провайдер и модель: какой AI-провайдер на MVP — OpenAI-compatible, Anthropic, локальный, или stub до покупки ключа? Варианты: (a) OpenAI-compatible по `AI_PROVIDER`+`AI_MODEL`; (b) конкретный вендор сразу; (c) только stub в итерации 5, ключ позже.
2. Бюджет и лимиты: дневной/месячный лимит запросов на пользователя и глобально? Варианты: (a) N запросов/день + 429 с человеческим текстом; (b) без лимита в MVP; (c) только длина контекста без счётчика.
3. Scope `proposal_type` в MVP: все 5 (`goal_breakdown`, `task_creation`, `schedule_suggestion`, `schedule_changes`, `productivity_analysis`) или subset? PRD §6.4 требует все инструменты, §17 — все строки Phase 4. Варианты: (a) все 5; (b) только `schedule_*` + `productivity_analysis`; (c) только `goal_breakdown` первым.
4. `expires_at` предложений: TTL? Варианты: (a) 7 дней + cron/пометка `expired` при чтении; (b) без срока; (c) 24 часа.
5. Применение: целиком + по одному действию + ручная правка (§4.4 требует всё)? Варианты: (a) да, все три; (b) только целиком в MVP.
6. Удаление диалога: что с messages/proposals? Варианты: (a) messages CASCADE, proposals `conversation_id SET NULL` (аудит живёт); (b) всё CASCADE; (c) запрет удаления при живых `pending` proposals.
7. Weekly review: отдельный экран или вкладка Assistant? Streaming ответов нужен? Варианты: (a) Assistant-вкладка, без streaming; (b) отдельный роут, без streaming; (c) streaming в MVP (отдельная единица).
8. Контекст: сколько задач/целей слать в промпт (лимиты токенов)? Варианты: (a) последние 50 задач + активные цели, truncate с пометкой; (b) только за неделю + цель из вопроса; (c) без truncate (риск 413/таймаута).
9. e2e с живым ключом: выделять ли платный ключ для CI? Варианты: (a) нет — только stub, live-тест вручную владельцем; (b) да, отдельный ключ + отдельный проект.
10. Язык ответов AI: интерфейс English (§1), пользователь русскоязычный. Варианты: (a) ответы English; (b) язык из `profiles.language`; (c) язык сообщения пользователя.

## 3. Шаги итерации (один шаг = один коммит)

Каждый шаг: цель → файлы → готово → проверка. Проверки запускает исполнитель, не планировщик.
Глобальный gate каждой единицы: `npm run typecheck && npm run lint && npm test`; `build` — где указано.

### Шаг 1. Схема `0006_ai_assistant` + типы (миграция НЕ применяется)

Цель: таблицы `ai_conversations` / `ai_messages` / `ai_proposals` в стиле 0005 + типы.

Новые файлы:

- `supabase/migrations/0006_ai_assistant.sql`
- `src/types/ai.ts` (если Row-типы не влезают в `database.ts` — иначе только `database.ts`) + тест маппера `src/types/ai.test.ts`

Изменяемые:

- `src/types/database.ts` (`AiConversationsRow`, `AiMessagesRow`, `AiProposalsRow` + `map*` в camelCase)
- `src/types/domain.ts` (`AiConversation`, `AiMessage`; `AiProposal`/`AI_PROPOSAL_STATUSES` уже есть — добавить `PROPOSAL_TYPES`, `AI_MESSAGE_ROLES` как union вместо `string`)

Содержимое — словами (см. §4): FK, CHECK, индексы, триггер `set_updated_at()`, RLS 4 политики на таблицу + `EXISTS`-гард владения `conversation_id` (образец `0005:48-62`, `0004:105-139`).

Готово: SQL целиком в стиле 0004/0005; `database.ts`/`domain.ts` в том же коммите (AGENTS.md §6); UI не изменился; миграция не применена.

Проверка: `npm run typecheck && npm run lint && npm test`

### Шаг 2. Чистый lib: схемы и валидатор предложений (без JSX, без Supabase)

Цель: единый источник правды structured output — Zod-схемы + JSON Schema-эквивалент + парсер с кодами ошибок (§6.5, §16).

Новые файлы:

- `src/lib/aiProposals.ts`
- `src/lib/aiProposals.test.ts`

Что внутри: дискриминированный union payload по `proposal_type` (5 типов из вопроса 3; пока — все 5 за stub-значениями, урезание только по ответу владельца); поля `type/summary/reasoning/actions[]`; per-action схемы (`reschedule_task`, `create_task`, `create_milestone`, `complete_milestone`, `update_preferences` — последний только как предложение, не применение); `parseAssistantResponse()` → `ok | error(code)`; коды `invalid_json`, `unknown_type`, `missing_task`, `forbidden`, `bad_date`, `conflict`, `no_time`.

Готово: парсер покрыт тестами (валидный пример §6.5 проходит; битый JSON, несуществующая задача, инвертированный интервал — reject с кодом); `lib` не импортирует фичи/компоненты.

Проверка: `npm run typecheck && npm run lint && npm test`

### Шаг 3. Edge Function: провайдер-независимый слой + каркас tool layer (секреты только здесь)

Цель: `ai-assistant` Edge Function с интерфейсом провайдера и заглушкой; никакого ключа в репо.

Новые файлы:

- `supabase/functions/ai-assistant/index.ts` (auth по JWT, лимит размера запроса, вызов tools, вызов провайдера, валидация ответа через схемы шага 2, запись `ai_messages`/`ai_proposals` от имени пользователя, логи без секретов)
- `supabase/functions/ai-assistant/provider.ts` (`AiChatProvider` interface: `chat({messages, tools, jsonSchema})`)
- `supabase/functions/ai-assistant/providers/stub.ts` (детерминированная фикстура для тестов/e2e без ключа)
- `supabase/functions/ai-assistant/providers/openaiCompatible.ts` (fetch по `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` из secrets; timeout + AbortController; 429/5xx → код `ai_unavailable`)
- `supabase/functions/ai-assistant/tools.ts` (каркас 9 инструментов: сигнатуры + чтение через user-scoped client; suggest_* возвращают proposals, не записи)
- `supabase/functions/ai-assistant/deno.json`, `supabase/functions/ai-assistant/README.md` (какие secrets выставить, как переключить `AI_PROVIDER`)

Готово: `AI_PROVIDER=stub` отвечает фикстурой без сети; `openaiCompatible` не импортируется во frontend; `service_role` не используется для обхода RLS — только JWT пользователя; таймаут закрыт кодом, не висящим запросом.

Проверка: `npm run typecheck && npm run lint && npm test` + `supabase functions serve ai-assistant --env-file ./supabase/.env.local` вручную (исполнитель, без коммита секретов)

### Шаг 4. Tool layer чтения: реальные данные только владельца

Цель: реализовать `get_user_goals`, `get_user_tasks`, `get_weekly_progress`, `get_user_preferences` поверх user-scoped Supabase-клиента внутри Function.

Изменяемые:

- `supabase/functions/ai-assistant/tools.ts`
- новые тесты: `supabase/functions/ai-assistant/tools.test.ts` (deno test с моком клиента)

Правила: `user_id` только из JWT (`auth.uid()` эквивалент в Function), аргумент `user_id` от клиента игнорируется/отсутствует; `get_weekly_progress` считает по тем же формулам, что Dashboard (`Completed/Total`, overdue через IANA-пояс из `profiles.timezone`); truncate контекста с пометкой `truncated: true` (размер — по ответу на вопрос 8, дефолт предложить 50/100 и зафиксировать в коде константой).

Готово: чужой `user_id` вернуть не может по построению; пустые данные → честный пустой контекст, не выдуманные цифры (§22 п. 4).

Проверка: `npm run typecheck && npm run lint && npm test` + `deno test` внутри функции (исполнитель)

### Шаг 5. Серверная проверка каждого действия (ядро безопасности §6.5)

Цель: `validateAction()` в Function: ни одно действие не применяется без построчной проверки.

Новые файлы:

- `supabase/functions/ai-assistant/validate.ts`
- `supabase/functions/ai-assistant/validate.test.ts`

Проверки (каждая — до записи, первая неудача → reject действия с кодом): задача существует; `task.user_id = caller`; статус перехода допустим (`TASK_STATUSES`); даты парсятся и `end > start`; нет конфликта расписания — только через публичный контракт planner (`findConflicts`-эквивалент на сервере поверх `time_blocks`, без импорта внутренностей `usePlanPreview`); сон/прошлое — как в Д2 planner (блок в сон/прошлое — только если предложение явно помечено и пользователь подтвердил); цель/этап принадлежат пользователю при `goal_breakdown`/`task_creation`; `update_preferences` — только валидация, без записи (применение — через существующий settings-сервис после approve человеком).

Готово: недействительные предложения не применяются (§18 AI); ошибки маппятся в коды §16, не в сырые трейсы; секреты в логи не попадают.

Проверка: `npm run typecheck && npm run lint && npm test` + `deno test`

### Шаг 6. Frontend сервис чата: conversations/messages (слои как в planner)

Цель: `src/features/assistant/*` по образцу `planner/{api,schemas,hooks,queryKeys}`.

Новые файлы:

- `src/features/assistant/api.ts` (identity из `auth.getSession()`, без `user_id`-аргумента; `listConversations`, `createConversation`, `deleteConversation`, `listMessages`, `sendMessage` → `functions.invoke('ai-assistant')`)
- `src/features/assistant/schemas.ts` (Zod: title 1–100, content 1–4000, `conversationId` uuid)
- `src/features/assistant/errors.ts` (`AssistantServiceError` + коды, образец `planner/errors.ts`)
- `src/features/assistant/hooks.ts` (`useConversations`, `useMessages`, `useSendMessage`)
- `src/features/assistant/queryKeys.ts` (фабрика `assistant.*`, инвалидация только своего префикса)
- `src/features/assistant/api.test.ts`

Готово: N+1 нет (сообщения — один запрос на диалог); инвалидация — только `assistant.*` + при approve — связанные `tasks`/`planner` ключи (не весь кэш, не `["goals","list"]` без нужды); `service_role` не используется.

Проверка: `npm run typecheck && npm run lint && npm test`

### Шаг 7. Apply/Reject предложений с серверной перепроверкой

Цель: контракты `POST /ai/proposals/:id/approve|reject` (§13) — перепроверка в момент apply, идемпотентность, обратимость где возможна.

Новые/изменяемые:

- `supabase/functions/ai-assistant/index.ts` (ветки `approve`/`reject`: повторный `validateAction()` в транзакции/батче; `pending → approved + applied_at` или `→ rejected`; повторный approve — noop; `expired` — применять нельзя)
- `src/features/assistant/api.ts`, `hooks.ts` (`useApproveProposal`, `useRejectProposal` с `previousTaskId`-паттерном инвалидации как в planner)
- `src/features/assistant/applyProposal.test.ts` (unit на идемпотентность и переходы статусов; живой apply — только e2e)

Правила: delete/reschedule/deadline — только здесь и только после approve; `goal_breakdown` пишет milestones через тот же сервис-гард (`position`, `pending|completed`); `schedule_*` пишет через публичный контракт planner (`createBlock`/`applyPlan`-совместимые записи, не дублируя внутреннюю генерацию плана); `update_preferences` — через settings-сервис, не прямой SQL; каждая запись — `user_id` из JWT.

Готово: гонка «задача изменена другим запросом» (§16) → перепроверка падает с `stale` вместо порчи данных; applied-записи обратимы удалением/откатом там, где это технически возможно (§22 п. 10).

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`

### Шаг 8. UI: Assistant + ProposalModal (accept-all / per-action / reject / ручная правка)

Цель: чат и модалка предложений с объяснением «почему» (§22 п. 9) и состояниями §9.4.

Новые файлы:

- `src/features/assistant/AssistantPage.tsx` (замена `PhasePlaceholder`; роут уже существует)
- `src/features/assistant/ChatPanel.tsx` (+ `ChatPanel.test.tsx`)
- `src/features/assistant/ProposalModal.tsx` (+ `ProposalModal.test.tsx`: accept-all, per-action toggle, reject, ручная правка до approve с перепроверкой конфликтов)
- `src/features/assistant/ProposalActionRow.tsx` (строка действия: что изменится, причина, статус проверки)

Правила слоёв: JSX только рендер; валидация в `schemas.ts`; данные через хуки шага 6–7. Состояния: loading/empty («Спросите, например…» + 3 примера из §6.2)/error/success; подтверждение деструктивного действия отдельным диалогом (§18 Planner-паттерн, §6.6); до подтверждения расписание/цели неизменны (превью не пишет). Дизайн-токены как в planner (без `rounded-lg|text-xs|min-h-screen` leftovers — grep из AGENTS.md §7 п. 6).

Готово: сценарии B (breakdown → approve) и E (sick → облегчённый план → per-item approve) проходятся вручную; без ключа провайдера — честный `AI unavailable, stub mode` вместо выдуманного ответа.

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`

### Шаг 9. Weekly review + Dashboard Insights + e2e + журнал

Цель: замкнуть Phase 4: weekly review и анализ невыполненных на том же пайплайне; e2e на stub; документы.

Новые/изменяемые:

- `src/features/assistant/WeeklyReview.tsx` (тонкая обёртка над `analyze_productivity` + `get_weekly_progress`; без собственной копии агрегатов — данные из шагов 4–5)
- `src/features/dashboard/*` (минимальная правка: Insights зовёт `analyze_productivity` только при наличии ключа/stub-флага; иначе остаются детерминированные строки итерации 2 — выдуманных цифр нет)
- `e2e/assistant.spec.ts` (stub-провайдер: chat → proposal → approve; chat → proposal → reject; RLS-негатив через чужой `conversation_id` как в `scripts/verify-rls.mjs`; live-ветка `test.skip(!E2E_AI_KEY)` — без живого ключа не гонять)
- `docs/progress.md` (запись итерации), `docs/ARCHITECTURE.md` (§4 — строка про assistant-модуль, если контракт изменился), `README.md` (раздел AI: нужен ключ, без ключа — stub)

Готово: полный gate зелёный; e2e на stub — зелёный; live-e2e — skip без ключа (см. Риски); приёмка §18 AI + сценарии B/E вручную на двух аккаунтах (изоляция RLS).

Проверка: `npm run typecheck && npm run lint && npm test && npm run build` + `npm run test:e2e` вручную (исполнитель)

## 4. Схема БД: словами, без применения

Одна миграция `supabase/migrations/0006_ai_assistant.sql` (стиль 0005: шапка-решения, таблицы, индексы, триггер, RLS). Применение — отдельной командой владельца после ревью. В том же коммите — `src/types/database.ts` + `src/types/domain.ts` (AGENTS.md §6).

- `ai_conversations`: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `title text NOT NULL`, `created_at timestamptz NOT NULL default now()`, `updated_at timestamptz NOT NULL default now()`. CHECK: `title <> ''` (длина — Zod 1–100, БД держит непустоту). Индексы: `(user_id)`, `(user_id, created_at)`. Триггер `set_updated_at()`. DELETE поведения: удаление диалога удаляет сообщения (CASCADE, см. ниже); proposals при удалении диалога — `SET NULL` (вариант (a) вопроса 6; финал — по ответу владельца).
- `ai_messages`: `id uuid PK`, `conversation_id uuid NOT NULL → ai_conversations(id) ON DELETE CASCADE`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `role text NOT NULL CHECK (role IN ('user','assistant','system'))`, `content text NOT NULL CHECK (content <> '')`, `metadata jsonb NOT NULL default '{}'`, `created_at timestamptz NOT NULL default now()` (без `updated_at` — сообщение неизменяемо, как в PRD §11.11). Индексы: `(user_id)`, `(conversation_id)`, `(conversation_id, created_at)`. RLS `EXISTS`-гард: `conversation_id` обязан принадлежать `auth.uid()` (образец 0005) — иначе кросс-тенантная ссылка создалась бы, но была бы невидима; здесь — сразу reject.
- `ai_proposals`: `id uuid PK`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `conversation_id uuid NULL → ai_conversations(id) ON DELETE SET NULL`, `proposal_type text NOT NULL CHECK (proposal_type IN ('goal_breakdown','task_creation','schedule_suggestion','schedule_changes','productivity_analysis'))`, `payload jsonb NOT NULL`, `status text NOT NULL CHECK (status IN ('pending','approved','rejected','expired'))` (PRD §11.12 + строгий CHECK по §11.13), `expires_at timestamptz NULL CHECK (expires_at IS NULL OR expires_at > created_at)`, `applied_at timestamptz NULL CHECK (applied_at IS NULL OR status = 'approved')`, `created_at timestamptz NOT NULL default now()` (без `updated_at` — переходы статусов видны через `status/applied_at`). Индексы: `(user_id)`, `(user_id, status)`, `(conversation_id)`, `(expires_at)` для истечения. `payload` — только данные, без секретов (§6.7).
- RLS: `ENABLE ROW LEVEL SECURITY` на всех трёх; по 4 политики на таблицу (`select/insert/update/delete own`: `user_id = auth.uid()`; `profiles`-исключения нет). `insert/update` на messages/proposals дополнительно требуют `EXISTS (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())`. Никаких `security definer`, никаких послаблений.
- Что сознательно НЕ вводим: `vector`/`embeddings`-колонки, `tokens_used`/`cost` (биллинг — вне итерации), `source`/`confidence` (PRD не требует), отдельная таблица действий (действия — массив в `payload`, валидируется Zod/JSON Schema).

## 5. Тесты: что именно проверяют

- Unit (Vitest): `aiProposals.test.ts` — пример §6.5 проходит, битый JSON → `invalid_json`, неизвестный `type` → reject, инвертированный интервал → `bad_date`, несуществующая задача → `missing_task`; `validate.test.ts` — чужая задача → `forbidden`, сон/прошлое → `conflict` без явного подтверждения, допустимый перенос → ok; `tools.test.ts` — truncate помечен, пустые данные не выдумываются; `assistant/api.test.ts` — CRUD диалогов на моке клиента, `sendMessage` шлёт без `user_id`.
- RLS-негативы (живая БД, после применения 0006 владельцем, `service_role` не использовать): второй аккаунт не читает чужие conversations/messages/proposals (0 строк); вставка message с чужим `conversation_id` падает на `WITH CHECK`; approve чужого `proposal_id` — 0 строк/403; доказательства — вывод запросов как в `scripts/verify-rls.mjs`.
- Component (RTL): `ChatPanel` — loading/empty/error; `ProposalModal` — accept-all, per-action toggle, reject, ручная правка с перепроверкой; деструктивное действие — только через подтверждение; без провайдера — `AI unavailable`, а не молчание.
- e2e (Playwright, stub): `assistant.spec.ts` — (1) B: «разбей цель» → proposal → approve → этапы появились; (2) E: «болею» → proposal → reject → расписание не изменилось; (3) RLS: чужой id → недоступно; (4) часовые пояса (§19 п. 12) — слоты в поясе из `profiles.timezone`. Live-ветка с реальным ключом — `test.skip(!E2E_AI_KEY)`, в CI без ключа не гоняется.

## 6. Риски и что необратимо

- Стоимость вызовов: каждый `sendMessage` — деньги. Митигация: лимиты (вопрос 2), truncate контекста, stub по умолчанию, счётчик в `metadata` (не биллинг, а наблюдаемость). Без решения вопроса 2 шаг 3 везёт дефолт «10/день» как константу — пересмотр владельцем.
- Таймауты Edge Function (Supabase ~60–150с): длинная генерация упадёт. Митигация: AbortController + короткий системный промпт + truncate; ошибка `ai_unavailable` с retry-кнопкой, данные не портятся (§16).
- Ключа у владельца нет / ключ отозван: весь AI-контур деградирует в stub с честным баннером; чат не врёт (§22 п. 4); e2e-live невозможен — только stub (см. ниже).
- e2e без живого ключа неполноценен: stub доказывает plumbing (chat → proposal → approve/reject → RLS), но не качество советов. Live-приёмка — вручную владельцем.
- Промпт-инъекция через названия задач: AI может вернуть «инструкцию» из пользовательского текста. Митигация: structured output + whitelist `proposal_type`/`action`, игнор свободных полей, серверная проверка каждого действия.
- Гонки: задача/цель изменилась между proposal и approve (§16). Митигация — перепроверка в шаге 7; проигравшее действие падает с `stale`, остальные применяются; частичный apply виден в UI построчно.
- Параллельный planner: повторная генерация плана может сменить внутренности `usePlanPreview`. Митигация — зависимость только от публичного контракта (см. Границы); если контракт planner поменяется, шаги 5/7 останавливаются и ждут вопроса владельцу, молча не адаптируются.
- Необратимо: применённая миграция 0006 (откат = потеря диалогов); применённые proposals (созданные задачи/этапы/блоки остаются в БД — удаляются только вручную/штатным delete с подтверждением; `applied_at`/`status` назад не откатываются); потраченные деньги на AI-вызовы; удалённая история диалогов при варианте (b) вопроса 6. Всё остальное (reject, expired, preview) — безопасно.

## 7. Что НЕ входит в итерацию (явно)

- Голосовой ввод/вывод (PRD §21 — вне первой версии).
- Embeddings / векторный поиск / `pgvector` / семантическая память диалогов.
- Автоприменение без согласия (PRD §21: «автоматическое управление жизнью без подтверждения» — запрещено; §6.6).
- Стриминг ответов (deferred — вопрос 7, вариант (c) только отдельной единицей позже).
- Календарные синхронизации (Google/Apple — §21), нативные приложения, соцсеть, публичные профили.
- Сложные предиктивные модели, финансовый модуль, носимые устройства, сложная система уведомлений (§21).
- Почта/SMTP, magic link, resend, восстановление пароля письмом (выключены бессрочно).
- Биллинг-дашборд токенов, выбор модели в UI, fine-tuning, multi-agent.
- `goal_events` (долг Phase 2), habits/analytics (Phase 5), пагинация задач, `ON CONFLICT`-докрутки вне assistant.
- Применение миграции 0006 в кодовых единицах (только владелец отдельной командой после ревью файла).

## 8. Куда записано

Итог — этот файл: `docs/plan-phase-4.md` (единственный новый файл сессии планировщика).
Существующие файлы не редактировались, команды не запускались, миграция не применялась.
