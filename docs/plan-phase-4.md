# План итерации 5 — Phase 4: AI Assistant (план, код не писать)

> **Статус: итерация 5 ЗАКРЫТА 2026-11-04.** Шаги 1–8 + хотфиксы выполнены; живой прогон
> подтверждён (чат → предложение → approve → задачи; preflight `204`, таблица `200`, функция `401`).
> Остаток вынесен в Phase 4.1 (см. ROADMAP): e2e на stub для PRD §19 пп. 9–10, ручная правка
> предложения (8.1), отдельные коды для 429/таймаута провайдера.
> Миграция `0006` применена владельцем, функция задеплоена, секреты — в Supabase.
> Реализация шла отдельными сессиями по одному шагу = один коммит.
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

## 2. Решения (владелец + ревью, 2026-11-04)

1. Р1: провайдер-независимый адаптер Edge Function; env `AI_PROVIDER=stub|openai-compatible`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_TIMEOUT_MS`; имя модели в коде отсутствует; не OpenAI-совместимый провайдер — отдельный адаптер только после чтения его документации, до этого stub; секреты только в окружении функции.
2. Р2: CHECK `proposal_type` содержит все 5 типов; порядок реализации: `goal_breakdown` + `task_creation` → `schedule_suggestion` → `schedule_changes` → `productivity_analysis`.
3. Р3: `expires_at` = `created_at` + 7 days (DEFAULT + CHECK `>` `created_at`); в БД статусы `pending|approved|rejected`; `expired` вычисляется на чтении; approve просроченного — ошибка.
4. Р4: UI English; ассистент отвечает на языке последнего сообщения пользователя, fallback `profiles.language`; названия целей/задач не переводятся.
5. Р5: accept-all + per-item + ручная правка действия до approve.
6. Р6: messages CASCADE, `proposals.conversation_id` SET NULL.
7. Р7: weekly review — вкладка Assistant, без streaming.
8. Р8: контекст — активные цели + 50 последних задач, truncate с пометкой в метаданных.
9. Р9: e2e только stub, live — вручную владельцем.
10. Р10: rate limit 50 user-сообщений / 24ч: подсчёт user-scoped клиентом до вызова провайдера, выше — 429 {code:"rate_limited"}.

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

Содержимое — словами (см. §4): FK, CHECK, индексы, триггер `set_updated_at()` на conversations/proposals, RLS 11 политик (4 conversations + 3 messages + 4 proposals) + `EXISTS`-гард владения `conversation_id` (образец `0005:48-62`, `0004:105-139`).

Готово: SQL целиком в стиле 0004/0005; `database.ts`/`domain.ts` в том же коммите (AGENTS.md §6); UI не изменился; миграция не применена.

Проверка: `npm run typecheck && npm run lint && npm test`

Правки ревью (2026-11-04, миграция всё ещё не применена):
- a) `idx_ai_proposals_conversation_id` — FK `ON DELETE SET NULL` без индекса сканировал бы таблицу при удалении диалога;
- b) `ai_proposals_insert_own`: `status = 'pending' AND applied_at IS NULL` — клиент не создаёт «одобренное» предложение, approve — только серверный UPDATE;
- c) CHECK симметричен: `(status = 'approved') = (applied_at IS NOT NULL)` — ни approved без метки, ни метки без approved;
- d) убрана `ai_messages_update_own`: immutability теперь enforced отсутствием UPDATE-политики (RLS default-deny); у messages 3 политики вместо 4, слово immutable в комментарии оставлено как констатация гарантии.

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

> Статус (2026-11-04): реализован. Коммит B: `validate.ts` + `validate.test.ts`
> (коммит A рядом чинил шаги 3–4: закрытое недельное окно, локальный todayKey,
> два count-запроса, `calculateCompletionRate`/`isTaskOverdue` из `src/lib`).
> Сигнатура `validateActions(actions, context) -> {ok:true} | {ok:false, index,
> code, message}`; коды — 10 из §16 (`missing_goal`, `missing_milestone`,
> `missing_task`, `wrong_status`, `invalid_date`, `inverted_interval`,
> `conflict`, `past`, `no_time`, `forbidden`). Расписание — только через
> `findConflicts` из `src/lib/planner.ts` (касание рёбер не конфликт); формулы
> дат/времени — через `toDateKey`/`toWallTime` из `src/lib/dates.ts`
> (импорт-мап `deno.json`: `@/lib/dates`, `@/lib/planner`, `@/lib/progress`,
> `@/lib/aiProposals`). Без N+1: один запрос на набор id сущности + один
> запрос блоков на union-спан; контекст (`client`, `now`, `timeZone`,
> `wake/sleep`, `working/work/study`) снаружи, `new Date()` внутри нет.
> Отклонение от текста ниже: чужая задача/цель/этап читается RLS-клиентом как
> отсутствующая → `missing_*` (не `forbidden`); `forbidden` — ошибки хранилища
> (fail closed) и неподдерживаемые значения enum. Живьём не проверено:
> миграция 0006 не применена, функция не задеплоена.

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

> Статус (2026-11-04): выполнен. `src/features/assistant/`: `schemas.ts`
> (`sendMessageSchema`: message trim 1–4000, `conversationId` uuid|null),
> `errors.ts` (`AssistantServiceError`, 7 кодов по ТЗ), `api.ts`
> (`listConversations`/`listMessages`/`sendMessage`), `queryKeys.ts`
> (фабрика `assistant.*`), `hooks.ts`
> (`useConversations`/`useMessages`/`useSendMessage`), `api.test.ts` +
> `hooks.test.tsx` (моки клиента как в `planner/api.test.ts`).
> `sendMessage` шлёт только `{ message, conversationId }` через
> `functions.invoke("ai-assistant")` (identity — сессия supabase-js, никакого
> `user_id` в аргументах/теле; Authorization вручную не подменяется),
> предложение перепроверяется `assistantProposalSchema` (мусор из 2xx-ответа
> уходит в `invalid_response`, не в рендер). Инвалидация — только `assistant.*`
> (`conversations` + `messages(conversationId)`); `["goals","list"]` и
> `["tasks",...]` не трогаются (предложение ещё не применено — это шаг 7).
> Отклонение от текста выше: `createConversation`/`deleteConversation` в этом
> шаге нет — диалог создаёт сервер на первом `sendMessage` (edge
> `handleChat`), удаление истории — в шаге 8 вместе с UI; чтения идут через
> существующие таблицы, как требует задача шага. Живьём не проверено:
> миграция 0006 не применена, функция не задеплоена.

### Шаг 7. Apply/Reject предложений с серверной перепроверкой

Цель: контракты `POST /ai/proposals/:id/approve|reject` (§13) — перепроверка в момент apply, идемпотентность, обратимость где возможна.

Новые/изменяемые:

- `supabase/functions/ai-assistant/index.ts` (ветки `approve`/`reject`: повторный `validateAction()` в транзакции/батче; `pending → approved + applied_at` или `→ rejected`; повторный approve — noop; `expired` — применять нельзя)
- `src/features/assistant/api.ts`, `hooks.ts` (`useApproveProposal`, `useRejectProposal` с `previousTaskId`-паттерном инвалидации как в planner)
- `src/features/assistant/applyProposal.test.ts` (unit на идемпотентность и переходы статусов; живой apply — только e2e)

Правила: delete/reschedule/deadline — только здесь и только после approve; `goal_breakdown` пишет milestones через тот же сервис-гард (`position`, `pending|completed`); `schedule_*` пишет через публичный контракт planner (`createBlock`/`applyPlan`-совместимые записи, не дублируя внутреннюю генерацию плана); `update_preferences` — через settings-сервис, не прямой SQL; каждая запись — `user_id` из JWT.

Готово: гонка «задача изменена другим запросом» (§16) → перепроверка падает с `stale` вместо порчи данных; applied-записи обратимы удалением/откатом там, где это технически возможно (§22 п. 10).

Проверка: `npm run typecheck && npm run lint && npm test && npm run build`

> Статус (2026-11-04): реализован. Фикс `invalid_input` отдельным коммитом
> рядом: пустой/длинный `message` и кривой `conversationId`/`proposalId` дают
> код `invalid_input` с путём поля в `details` (раньше `unknown`).
> Edge Function — та же `ai-assistant`, дискриминатор `action` в теле
> (`approve`|`reject`; без `action` — прежний chat, обратная совместимость).
> Approve: чтение `ai_proposals` user-scoped клиентом (чужой id → 404
> `not_found`); не-`pending` → 409 `already_decided` (повторный approve НЕ
> noop — отклонение от текста выше, зафиксированное задачей); `expires_at` в
> прошлом → 410 `expired` (статус в БД не пишется, `expired` вычисляется,
> Р3). Затем `validateActions(actions, context)` с контекстом из собственных
> чтений (`now`/`timeZone` из `profiles`, `wake/sleep/working/study` из
> `user_preferences`; дефолты `07:00`/`23:00`/`UTC`/`{}` при пустых строках,
> сам валидатор fail closed на своих чтениях) — ДО первой записи; ошибка →
> 422 `validation_failed` `{index, actionCode}` и НИЧЕГО не записано. Затем
> применение по порядку тем же user-scoped клиентом (никакого
> `service_role`): `create_goal` → insert goals (дефолты `other`/`medium`/
> `active`/`0`/`manual`, `start_date` = сегодня в поясе пользователя, но не
> позже `target_date` — иначе CHECK `target_date >= start_date` упал бы);
> `create_milestone` → insert milestones (`goal_id` из действия, `position`
> max+1); `complete_milestone` → `completed + completed_at`;
> `create_task` → insert tasks; `reschedule_task` → `due_date` +
> `recurrence_rule_id = null` (как `rescheduleTask`); `schedule_blocks` →
> insert `time_blocks(block_type='task')` + зеркало `scheduled_start/end` в
> задачу (Д8), точная пара `(task_id,start,end)` сверяется по инстантам
> (`Date.parse`, как в `applyPlan`) — read-then-insert, при повторе зеркало
> всё равно дописывается; `update_preferences` → update
> `user_preferences`/`profiles` только по ненуллевым полям. Фикс гонки
> (2026-11-04): approve сначала делает условный claim `UPDATE ... SET
> status='approved', applied_at WHERE id + user_id + status='pending' +
> select` — 0 строк → 409 `already_decided` (два параллельных approve
> применяют действия один раз), затем apply, при сбое посреди apply — откат
> в `pending`/`applied_at=null` и 500 `apply_failed` `{applied, total}`
> (повтор может создать дубли — бэклог: RPC `apply_proposal` (атомарно),
> миграция 0007, не в этой итерации). В apply до 2 запросов на действие
> (`create_milestone`: position max+1 + insert; `schedule_blocks`: дедуп с
> диапазоном `.gt end_time` / `.lt start_time` + insert + зеркало), осознанно —
> N+1 нет (батч по типам невозможен: каждое действие пишет в свою таблицу).
> 410 `expired` терминален для UI: предложение не применяется, повтор
> невозможен, следующий шаг — новый диалог, а не Retry. Окно claim→apply:
> краш между claim и концом apply оставляет `approved+applied_at` без
> (полных) данных — повтор запрещён 409, чинится только бэклогом 0007 RPC
> `apply_proposal` (атомарно). Даты-колонки (`start_date`,
> `target_date`, `due_date`) нормализуются в день пользователя
> (`toDateOnly`: `YYYY-MM-DD` как есть, инстанты через `toDateKey`), метки
> (`start_time`, `completed_at`, `applied_at`) — инстанты как есть.
> Reject: `pending → rejected`, `applied_at` untouched (симметричный CHECK);
> повторный reject идемпотентен (200 с тем же телом), reject после approve →
> 409; никаких записей в `goals/tasks/time_blocks`. Аудит в обоих случаях:
> одна строка `ai_messages` `role='assistant'` с `metadata`
> `{proposalId, applied, rejected}` и нейтральным `content` — без секретов и
> без тела предложения (при `conversation_id IS NULL` аудит пропускается:
> `ai_messages.conversation_id` NOT NULL). Frontend: `api.ts` —
> `approveProposal`/`rejectProposal` через `functions.invoke` (тот же
> контракт ошибок, что у `sendMessage`, плюс `proposalIdSchema` с тем же
> `invalid_input`); `hooks.ts` — `useApproveProposal`/`useRejectProposal`.
> Инвалидация: после approve — `assistant.proposals()` +
> `assistant.messages(conversationId)` + `tasks.all` (lists+details) +
> `goals.all` (lists+details+milestones) + `planner.blocks` (вместо хардкода
> `["goals"]`); после reject — только `assistant.*`. Тесты — расширения существующих файлов (отдельного
> `applyProposal.test.ts` нет): `request.test.ts` — 4 кейса
> `parseDecideRequestBody`; `api.test.ts` — approve/reject успех (тело без
> `user_id`), `invalid_input` до сети, `invalid_response` на кривой форме,
> `forbidden` без сессии; `hooks.test.tsx` — approve трогает tasks/goals/
> planner, reject — только assistant. Живьём не проверено: миграция 0006 не
> применена, функция не задеплоена.

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

> Статус (2026-11-04, часть 1 — чат): `AssistantPage` — реальный экран вместо
> `PhasePlaceholder` (`PageHeader` + честная копия «Nothing changes until you
> review and confirm», без «AI»-обещаний); `ChatPanel` — список диалогов
> (`useConversations`) + лента (`useMessages`) + composer (`textarea`,
> Ctrl/Cmd+Enter, disabled на пустом и >4000, счётчик `n / 4000`); состояния
> loading (skeleton), empty («Ask about your week, or ask for a plan.» +
> 3 примера §6.2), error (текст из `AssistantServiceError` + Retry),
> `rate_limited` объясняет лимит «50 messages, resets tomorrow» и не
> предлагает немедленный Retry вслепую, disabled при отправке; после успеха
> сообщение приходит из инвалидации (без оптимистичных вставок). Токены
> только (`rounded-control/card`, `text-ui/body/micro`, `text-muted`,
> `duration-fast`), `min-h-11` touch targets, mobile-first.
>
> Статус (2026-11-04, часть 2 — модалка): `ProposalModal` открывается по
> «Review proposal» у последнего pending-предложения; показывает summary +
> reasoning, затем действия человеческим языком (`describeAction`: title/due,
> локальное время в поясе пользователя для `schedule_blocks`, список изменений
> для `update_preferences`); кнопки Accept all (все индексы), Accept selected
> (чекбоксы, sorted), Reject. Контракт approve расширен:
> `selectedIndexes?: number[]`, сервер валидирует (целые, 0..len-1, без дублей,
> sorted), применяет только их, `applied/total` по выбранным; без поля — все
> действия (обратная совместимость). Ошибки 409/410/422/500 в модалке с
> понятным шагом; 410 «proposal expired» терминален, без Retry. a11y:
> `role="dialog"` + `aria-modal` (нативный `<dialog>`), фокус в модалку
> (`data-autofocus` на Reject), Escape закрывает, фокус возвращается на кнопку.
>
> Решение 8.1 (записано, не реализовано): ручная правка действий (Р5) в этот
> шаг НЕ входит — это меняет доверенную границу (клиент присылает свои
> действия) и требует отдельного ревью с серверной re-валидацией. Отдельная
> единица после ревью этого шага.

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

- `ai_conversations`: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `title text NOT NULL`, `created_at timestamptz NOT NULL default now()`, `updated_at timestamptz NOT NULL default now()`. CHECK: `title <> ''` (длина — Zod 1–100, БД держит непустоту). Индекс: `(user_id)`. Триггер `set_updated_at()`. DELETE поведения: удаление диалога удаляет сообщения (CASCADE, см. ниже); proposals при удалении диалога — `SET NULL` (Р6).
- `ai_messages`: `id uuid PK`, `conversation_id uuid NOT NULL → ai_conversations(id) ON DELETE CASCADE`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `role text NOT NULL CHECK (role IN ('user','assistant','system'))`, `content text NOT NULL CHECK (content <> '')`, `metadata jsonb NOT NULL default '{}'`, `created_at timestamptz NOT NULL default now()` (без `updated_at` — сообщение неизменяемо, как в PRD §11.11; UPDATE-политики нет — RLS default-deny, у messages 3 политики вместо 4). Индекс: `(conversation_id, created_at)`. RLS `EXISTS`-гард: `conversation_id` обязан принадлежать `auth.uid()` (образец 0005) — иначе кросс-тенантная ссылка создалась бы, но была бы невидима; здесь — сразу reject.
- `ai_proposals`: `id uuid PK`, `user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE`, `conversation_id uuid NULL → ai_conversations(id) ON DELETE SET NULL`, `proposal_type text NOT NULL CHECK (proposal_type IN ('goal_breakdown','task_creation','schedule_suggestion','schedule_changes','productivity_analysis'))` (все 5, порядок rollout — в коде, Р2), `payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object') CHECK (payload <> '{}'::jsonb)`, `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))` (без `expired` — вычисляется на чтении, Р3), `expires_at timestamptz NULL DEFAULT (now() + interval '7 days') CHECK (expires_at > created_at)`, `applied_at timestamptz NULL`, `created_at timestamptz NOT NULL default now()`, `updated_at timestamptz NOT NULL default now()` + триггер `set_updated_at()`. Симметричный CHECK: `(status = 'approved') = (applied_at IS NOT NULL)`. Индексы: `(user_id, status)`, `(expires_at)`, `(user_id, proposal_type)`, `(conversation_id)` (последний — для `SET NULL`-пути). INSERT ограничен `status = 'pending' AND applied_at IS NULL` (approve — только серверный UPDATE). `payload` — только данные, без секретов (§6.7).
- RLS: `ENABLE ROW LEVEL SECURITY` на всех трёх; всего 11 политик: 4 на conversations, 3 на messages (без update), 4 на proposals (`select/insert/update/delete own`: `user_id = auth.uid()`; `profiles`-исключения нет). `select/insert/delete` на messages и все 4 на proposals требуют `EXISTS (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())`; у proposals гвард `conversation_id IS NULL OR EXISTS (...)` (откреплённые proposals остаются видимы владельцу). INSERT proposals дополнительно требует `status = 'pending' AND applied_at IS NULL`. Никаких `security definer`, никаких послаблений.
- Известное ограничение: approve не enforced БД — UPDATE-политика позволяет владельцу строки выставить `approved` (CHECK требует лишь парности с `applied_at`). Поэтому `status = 'approved'` НЕ означает «проверено»: шаг 7 (apply) обязан перепроверять каждое действие через `validateAction()` в момент применения, а UI показывает approve только после серверного подтверждения.
- Что сознательно НЕ вводим: `vector`/`embeddings`-колонки, `tokens_used`/`cost` (биллинг — вне итерации), `source`/`confidence` (PRD не требует), отдельная таблица действий (действия — массив в `payload`, валидируется Zod/JSON Schema).

## 5. Тесты: что именно проверяют

- Unit (Vitest): `aiProposals.test.ts` — пример §6.5 проходит, битый JSON → `invalid_json`, неизвестный `type` → reject, инвертированный интервал → `bad_date`, несуществующая задача → `missing_task`; `validate.test.ts` — чужая задача → `missing_task` (RLS-клиент читает чужое как отсутствующее; `forbidden` — только ошибки хранилища и неподдерживаемые enum), сон/пересечение → `conflict`, прошлое → `past`, допустимый перенос → ok; `tools.test.ts` — truncate помечен, пустые данные не выдумываются; `assistant/api.test.ts` — CRUD диалогов на моке клиента, `sendMessage` шлёт без `user_id`.
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
