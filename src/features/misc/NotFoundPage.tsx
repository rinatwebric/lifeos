import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { useMessages } from "@/lib/i18n/I18nContext";

/**
 * Full-screen dead end. It deliberately sits outside AppLayout: a missing
 * route should feel like the end of the map, not another panel inside the
 * workspace. The huge numeral is decorative; the heading and action carry the
 * accessible page.
 */
export function NotFoundPage() {
  const m = useMessages();

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-canvas px-5 py-6 text-content sm:px-8 lg:px-12">
      <header className="flex shrink-0 items-center">
        <Brand className="-ml-2" />
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-1 items-center py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          <p
            aria-hidden="true"
            className="pointer-events-none font-display text-[clamp(8rem,25vw,21rem)] leading-[0.72] font-medium tracking-[-0.09em] text-content/[0.07] select-none"
          >
            404
          </p>

          <div className="max-w-[420px] lg:pb-7">
            <h1 className="font-display text-[clamp(2.5rem,5vw,4.25rem)] leading-[0.95] font-medium tracking-[-0.05em] text-balance">
              {m.notFound.title}
            </h1>
            <p className="mt-5 max-w-[36ch] text-[17px] leading-[1.55] text-muted text-pretty">
              {m.notFound.description}
            </p>
            <p className="mt-2 text-caption text-muted text-pretty">{m.notFound.hint}</p>
            <Link
              to="/"
              className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-content px-5 text-ui font-medium text-canvas transition-[opacity,scale] duration-fast ease-standard hover:opacity-90 motion-safe:active:scale-[0.96]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {m.notFound.back}
            </Link>
          </div>
        </div>
      </main>

      <footer className="shrink-0 text-micro text-muted">{m.layout.brandTagline}</footer>
    </div>
  );
}
