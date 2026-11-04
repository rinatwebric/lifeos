# i18n catalog — editorial redesign (feat/editorial-ui)

New or changed UI strings for pickup by the i18n branch. Code keeps the EN copy next to
the components (existing `*_COPY` pattern); no second provider is introduced and no
existing key is renamed.

| Key | EN (in code) | RU |
| --- | --- | --- |
| `AUTH_LAYOUT_COPY.headline` | Turn intentions into a realistic day. | Превратите намерения в реалистичный день. |
| `AUTH_LAYOUT_COPY.stepGoals` | Set long-term goals and break them into milestones. | Ставьте долгосрочные цели и делите их на этапы. |
| `AUTH_LAYOUT_COPY.stepTasks` | Turn milestones into tasks with priorities and deadlines. | Превращайте этапы в задачи с приоритетами и сроками. |
| `AUTH_LAYOUT_COPY.stepDay` | Plan a realistic day — and adjust when life happens. | Планируйте реалистичный день — и корректируйте его, когда жизнь вмешивается. |
| `AUTH_LAYOUT_COPY.assistantNote` | The assistant proposes. You confirm. Nothing changes on its own. | Ассистент предлагает. Вы подтверждаете. Ничего не меняется само. |
| `DEMO_SIGN_IN_COPY.unavailable` | Demo account is unavailable in this environment. | Демо-доступ недоступен в этом окружении. |
| `RESET_PASSWORD_COPY.requestSubtitle` (changed) | Enter your account email below. | Введите адрес вашей учётной записи ниже. |
| `RESET_PASSWORD_COPY.mailOffNotice` | Email delivery is switched off for this installation, so no reset letter can arrive. Ask the workspace owner to reset your password. | Отправка писем в этой установке отключена, поэтому письмо со ссылкой не придёт. Попросите владельца рабочей области сбросить пароль. |

Unchanged keys: `AUTH_LAYOUT_COPY.tagline` (kept, still exported; the layout test no longer
asserts it), `SIGN_IN_COPY.*`, `SIGN_UP_COPY.*`, `CHECK_EMAIL_COPY.*`, all dashboard and
shell strings. `DashboardPage` reuses existing strings only ("No suggestions right now." is
new — add EN `No suggestions right now.` / RU `Пока нет предложений.` under a dashboard key
when the i18n branch wires it; code intentionally keeps the literal until then).
