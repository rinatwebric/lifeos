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
  subtitle: _layout.subtitle,
  dayFocus: _layout.dayFocus,
  assistantNote: _layout.assistantNote,
} as const;

/**
 * Editorial auth shell: a typographic brand panel with a real day-plan
 * artifact next to a 420px form column. On mobile the panel collapses to the
 * brand and promise above the form. Auth routes stay outside `AppLayout`
 * (no sidebar/nav).
 */
export function AuthLayout() {
  const t = useMessages().auth.layout;

  return (
    <div className="grid min-h-dvh bg-canvas text-content lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <aside className="hidden lg:flex lg:flex-col lg:px-14 lg:py-10 xl:px-20">
        <Brand className="-ml-2" />
        <div className="flex min-h-0 max-w-[560px] flex-1 flex-col justify-center gap-10 py-10">
          <div className="space-y-5">
            <p className="font-display text-[50px] leading-[1.04] font-medium tracking-[-0.045em] text-balance xl:text-[60px]">
              {t.headline}
            </p>
            <p className="max-w-[34ch] text-[18px] leading-[1.45] text-muted text-pretty">
              {t.subtitle}
            </p>
          </div>
          <AuthVisual />
        </div>
        <p className="max-w-[420px] text-caption text-muted text-pretty">{t.assistantNote}</p>
      </aside>

      <div className="flex flex-col items-center justify-center px-5 py-10 sm:px-8 lg:items-end lg:pr-14 xl:pr-20">
        <div className="w-full max-w-[420px]">
          <div className="rounded-card bg-surface p-6 sm:p-8">
            <div className="space-y-3 pb-7 lg:hidden">
              <Brand className="-ml-2" />
              <p className="font-display text-[32px] leading-[1.12] font-medium tracking-[-0.035em] text-balance">
                {t.headline}
              </p>
              <p className="text-ui text-muted text-pretty">{t.subtitle}</p>
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
