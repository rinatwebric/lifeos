import { Outlet } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";

import { AuthVisual } from "./AuthVisual";

export const AUTH_LAYOUT_COPY = {
  headline: "Turn intentions into a realistic day.",
  stepGoals: "Set long-term goals and break them into milestones.",
  stepTasks: "Turn milestones into tasks with priorities and deadlines.",
  stepDay: "Plan a realistic day — and adjust when life happens.",
  assistantNote: "The assistant proposes. You confirm. Nothing changes on its own.",
} as const;

const STEPS = [AUTH_LAYOUT_COPY.stepGoals, AUTH_LAYOUT_COPY.stepTasks, AUTH_LAYOUT_COPY.stepDay];

/**
 * Editorial auth shell: calm side panel (brand, visual, promise, steps) next
 * to a 400–460px form column. On mobile the panel collapses to a short intro
 * above the form. Auth routes stay outside `AppLayout` (no sidebar/nav).
 */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-canvas text-content lg:grid-cols-2">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:px-12 lg:py-10 xl:px-16">
        <Brand />
        <div className="mx-auto w-full max-w-md space-y-8">
          <AuthVisual />
          <div className="space-y-3">
            <p className="font-display text-4xl leading-tight tracking-tight text-balance">
              {AUTH_LAYOUT_COPY.headline}
            </p>
            <ol className="list-none space-y-2.5">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-baseline gap-3 text-ui text-muted">
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-display text-ui text-accent tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mx-auto w-full max-w-md border-t border-line pt-5 text-ui text-muted">
          {AUTH_LAYOUT_COPY.assistantNote}
        </p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px] space-y-6">
          <div className="space-y-2 lg:hidden">
            <Brand />
            <p className="font-display text-3xl leading-tight tracking-tight text-balance">
              {AUTH_LAYOUT_COPY.headline}
            </p>
            <p className="text-ui text-muted">{AUTH_LAYOUT_COPY.assistantNote}</p>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
