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
| `RESET_PASSWORD_COPY.requestSentMailOff` (new, replaces `requestSent`) | Request received. Email delivery is switched off for this installation, so no letter will arrive — ask the workspace owner to reset your password. | Запрос получен. Отправка писем в этой установке отключена, поэтому письмо не придёт — попросите владельца рабочей области сбросить пароль. |
| `DASHBOARD_COPY.emptyInsights` (new) | No suggestions right now. | Пока нет предложений. |
| `RESET_PASSWORD_COPY.mailOffNotice` | Email delivery is switched off for this installation, so no reset letter can arrive. Ask the workspace owner to reset your password. | Отправка писем в этой установке отключена, поэтому письмо со ссылкой не придёт. Попросите владельца рабочей области сбросить пароль. |

Unchanged keys: `SIGN_IN_COPY.*`, `SIGN_UP_COPY.*`, `CHECK_EMAIL_COPY.*`, all dashboard and
shell strings. `AUTH_LAYOUT_COPY.tagline` is removed (the editorial layout renders
`headline` + `assistantNote` instead); `RESET_PASSWORD_COPY.requestSent` is replaced by
`requestSentMailOff`. Ru translations for both removals are not needed.
