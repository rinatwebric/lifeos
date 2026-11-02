---
name: lifeos-workflow
description: Use for any implementation task inside the LifeOS repository — enforces PRD-driven planning, migration and typing rules, verification gates, and the human-approval constraint for AI-driven changes.
---

# LifeOS workflow

Project-specific working loop for this repository. Combine it with the general skills
(`vercel-react-best-practices`, `supabase`, `test-driven-development`, `verification-before-completion`).

## Before writing code

1. Read `docs/PRD.md` for the requirement and `AGENTS.md` for the rules.
2. Check the current implementation of the module in `src/features/<module>` and shared helpers in `src/lib`.
3. Write a short plan: files to add/change, data touched, tests to add.
4. If the requirement is ambiguous, ask instead of inventing behaviour.

## Non-negotiables

- No mock data in production paths; empty states instead of fake numbers.
- No secrets in frontend; `service_role` and AI keys stay in Supabase Edge Functions.
- Schema changes only through `supabase/migrations/NNNN_*.sql`, with types updated in the same change.
- Every user table keeps RLS (`user_id = auth.uid()`; `profiles.id = auth.uid()`).
- AI output is a proposal; apply only after explicit user approval and server-side validation.
- Dates: store UTC, render in the user's IANA zone using `src/lib/dates.ts`.
- Any new calculation gets a unit test in the same folder.

## Verification gate

Run, in order, and fix failures before reporting:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For UI work, also check the four states (loading, empty, error, success) and the mobile layout.
Report what changed, what you verified, and what is still missing.

## Where things live

| Concern               | Location                                                 |
| --------------------- | -------------------------------------------------------- |
| Routes and providers  | `src/app`                                                |
| Layout and primitives | `src/components`                                         |
| Product modules       | `src/features/<module>`                                  |
| Pure helpers          | `src/lib`                                                |
| Domain types          | `src/types/domain.ts`                                    |
| Spec and decisions    | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` |
