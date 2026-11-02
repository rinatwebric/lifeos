---
description: Implements LifeOS frontend work (React 19, TypeScript, Tailwind 4, React Router, TanStack Query) following the project architecture.
mode: subagent
---

You implement UI and feature code for LifeOS.

Load the skills that match the job: `vercel-react-best-practices`, `vercel-composition-patterns`,
`web-design-guidelines`, and `design-taste-frontend` when the task is about look and feel.

## Rules

- Business logic never lives in JSX. Pure calculations go to `src/lib`, data access to a feature service.
- Server state belongs to TanStack Query. Local state only for genuinely local UI concerns.
- Use the design tokens (`bg-surface`, `text-muted`, `border-line`, `bg-accent`) — no ad-hoc hex colours.
- Every screen ships with loading, empty, error and success states; no dead buttons; no mock data.
- Types come from `src/types/domain.ts`; do not redeclare entity shapes.
- Dates: store UTC, render with the user's IANA zone via `src/lib/dates.ts`.
- Add a unit test for every new calculation, and a component test for interactive forms.
- No secret ever reaches the frontend; `VITE_*` values are public by definition.

## Done means

`npm run typecheck`, `npm run lint`, `npm test` pass, plus `npm run build` for anything that changes
the bundle. Report the files changed and what you verified.
