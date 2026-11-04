import { Outlet } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { en } from "@/lib/i18n/dictionaries/en";
import { useMessages } from "@/lib/i18n/I18nContext";

import { AuthVisual } from "./AuthVisual";

const _layout = en.auth.layout;

/**
 * Back-compat copy for tests: the EN source of the editorial auth strings.
 * The component itself renders `m.auth.layout` so an open form re-translates
 * on language switch.
 */
export const AUTH_LAYOUT_COPY = {
  headline: _layout.headline,
  stepGoals: _layout.stepGoals,
  stepTasks: _layout.stepTasks,
  stepDay: _layout.stepDay,
  assistantNote: _layout.assistantNote,
} as const;

/**
 * Editorial auth shell: calm side panel (brand, visual, promise, steps) next
 * to a 400–460px form column. On mobile the panel collapses to a short intro
 * above the form. Auth routes stay outside `AppLayout` (no sidebar/nav).
 */
export function AuthLayout() {
  const t = useMessages().auth.layout;
  const steps = [t.stepGoals, t.stepTasks, t.stepDay];

  return (
    <div className="grid min-h-dvh bg-canvas text-content lg:grid-cols-2">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:px-12 lg:py-10 xl:px-16">
        <Brand />
        <div className="mx-auto w-full max-w-md space-y-8">
          <AuthVisual />
          <div className="space-y-3">
            <p className="font-display text-4xl leading-tight tracking-tight text-balance">
              {t.headline}
            </p>
            <ol className="list-none space-y-2.5">
              {steps.map((step, index) => (
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
          {t.assistantNote}
        </p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px] space-y-6">
          <div className="space-y-2 lg:hidden">
            <Brand />
            <p className="font-display text-3xl leading-tight tracking-tight text-balance">
              {t.headline}
            </p>
            <p className="text-ui text-muted">{t.assistantNote}</p>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
