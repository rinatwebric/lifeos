# `ai-assistant` Edge Function (iteration 5, step 3)

Provider-independent chat endpoint. The frontend calls it via
`supabase.functions.invoke("ai-assistant")` (service module lands in step 6);
the function validates, calls the provider, re-validates with `parseProposal`
(step 2) and stores a **pending** proposal. Nothing is applied here —
approve/reject with re-validation is step 7.

## Secrets (owner only, never in git or `VITE_*`)

```bash
supabase secrets set AI_PROVIDER=stub
# live provider (Meta Model API, OpenAI-compatible):
supabase secrets set AI_PROVIDER=openai-compatible
supabase secrets set AI_BASE_URL=https://api.meta.ai/v1
supabase secrets set AI_MODEL=muse-spark-1.3
supabase secrets set AI_API_KEY=<key>
supabase secrets set AI_TIMEOUT_MS=25000
```

| Variable | Required | Meaning |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | auto-provided | Injected by Supabase; the function builds a **user-scoped** client from the caller's JWT. No `service_role` is used anywhere. |
| `AI_PROVIDER` | no (default `stub`) | `stub` answers a fixed contract-valid fixture without network; `openai-compatible` calls `{AI_BASE_URL}/chat/completions`. Unknown values fail closed with `ai_unavailable`. |
| `AI_BASE_URL` | live only | Chat Completions base URL, no trailing slash required. |
| `AI_MODEL` | live only | Model name lives **only** here, never in code. |
| `AI_API_KEY` | live only | Sent only as an `Authorization: Bearer` header; never logged, never stored, never returned. |
| `AI_TIMEOUT_MS` | no (default `25000`) | Abort timeout for the provider call; a timeout answers `ai_unavailable`, never a hanging request. |

## Request / response

`POST` with `Authorization: Bearer <user JWT>`, body `{ "message": "…", "conversationId": null | "<uuid>" }`
(max 64 KiB / 4000 chars; larger → `413 too_large`).

- `200` → `{ conversationId, userMessageId, assistantMessageId, proposalId, proposal }`
  where `proposal` is the validated `{ proposalType, summary, reasoning, actions }`.
- `401 unauthorized` — missing/invalid/expired JWT (identity comes from
  `auth.getUser()`, never from a client `user_id`).
- `400 invalid_json | invalid_schema`, `404 not_found` (foreign conversation),
  `413 too_large`, `502 ai_unavailable` (provider failure or invalid provider
  JSON), `500 db_error | ai_unavailable` (misconfiguration).

Logs carry provider name, user id, conversation id and action count only —
no keys, tokens, headers or message bodies.

## Local runs (no secrets committed)

```bash
# stub path, no key needed:
supabase functions serve ai-assistant --env-file ./supabase/.env.local
```

`./supabase/.env.local` is git-ignored; create it locally with
`AI_PROVIDER=stub` (live values only on the owner's machine, never in chat).

## Tests

Edge unit tests run in the main suite (Vitest), not only under Deno:

```bash
npm test -- supabase/functions/ai-assistant
```

- `providers/stub.test.ts` — the stub fixture **must** pass `parseProposal`
  (single source of truth stays `src/lib/aiProposals.ts`).
- `providers/openaiCompatible.test.ts` — `response_format` carries the exact
  `toJsonSchema()` output; 401/404/429/5xx/timeout/network all map to
  `ai_unavailable` with log-safe messages.
- `request.test.ts` — size limit, JSON and shape validation.
- `tools.test.ts` — the nine PRD §6.4 tools and the honest empty context.

`index.ts` imports `parseProposal`/`toJsonSchema` straight from
`src/lib/aiProposals.ts` via the `deno.json` import map
(`zod` → pinned esm.sh, `@/types/domain` → exact file mapping), so the
runtime contract cannot drift from the tested one. New Deno-only deps must
stay pinned (`https://esm.sh/<pkg>@<version>`); nothing from this directory
is imported by the frontend (`openaiCompatible` especially).

Migration `0006` is still **not applied** and nothing is deployed in this
step — both happen only on the owner's explicit command.
