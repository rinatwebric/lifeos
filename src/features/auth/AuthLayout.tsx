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
  accountLabel: _layout.accountLabel,
} as const;

/**
 * Editorial auth shell: calm side panel (brand, promise, numbered steps,
 * planning visual) next to a 440px form column. On mobile the panel collapses
 * to a compact brand and headline above the form. Auth routes stay outside
 * `AppLayout` (no sidebar/nav).
 */
export function AuthLayout() {
  const t = useMessages().auth.layout;
  const steps = [t.stepGoals, t.stepTasks, t.stepDay];

  return (
    <div className="grid min-h-dvh bg-canvas text-content lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:px-14 lg:py-10 xl:px-20">
        <Brand className="-ml-2" />
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-10 py-10">
          <div className="w-full max-w-[540px] space-y-6">
            <p className="font-display text-[42px] leading-[1.08] font-medium tracking-[-0.04em] text-balance xl:text-[50px]">
              {t.headline}
            </p>
            <ol className="list-none space-y-3 border-t border-line pt-5">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[1.75rem_1fr] items-baseline gap-3 text-ui text-muted"
                >
                  <span aria-hidden="true" className="text-micro text-muted/70 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-pretty">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <AuthVisual />
        </div>
        <p className="w-full max-w-[540px] border-t border-line pt-5 text-caption text-muted text-pretty">
          {t.assistantNote}
        </p>
      </aside>

      <div className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="hidden lg:flex lg:items-center lg:gap-4">
            <p className="text-micro text-muted">{t.accountLabel}</p>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
          <div className="rounded-card border border-line bg-surface p-6 sm:p-8 lg:mt-6">
            <div className="space-y-3 pb-7 lg:hidden">
              <Brand className="-ml-2" />
              <p className="font-display text-[32px] leading-[1.12] font-medium tracking-[-0.035em] text-balance">
                {t.headline}
              </p>
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
