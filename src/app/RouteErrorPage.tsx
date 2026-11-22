import { AlertTriangle, RotateCw } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useMessages } from "@/lib/i18n/I18nContext";

/**
 * Route-level error screen (React Router `errorElement`). Without it the router
 * shows its own "Unexpected Application Error" page with a raw stack trace and
 * a "Hey developer" banner — unacceptable for a real user (AGENTS §9.4).
 *
 * The most common real cause seen in production was a browser page translator
 * rewriting text nodes under React (`insertBefore` NotFoundError), so the copy
 * names that case instead of pretending it is our bug. The technical message is
 * shown only in development.
 */
export function RouteErrorPage() {
  const m = useMessages();
  const error = useRouteError();
  const message = error instanceof Error ? error.message : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 bg-canvas p-4 sm:p-6">
      <section className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="size-5 text-muted" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-content text-balance sm:text-title">
            {m.routeError.title}
          </h1>
          <p className="mx-auto max-w-md text-ui leading-relaxed text-muted text-pretty">
            {m.routeError.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button size="lg" onClick={() => window.location.reload()}>
            <RotateCw className="size-4" aria-hidden="true" />
            {m.routeError.reload}
          </Button>
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-pill border border-control px-5 text-ui font-medium text-content hover:bg-surface-raised"
          >
            {m.routeError.backToDashboard}
          </Link>
        </div>
      </section>

      {import.meta.env.DEV && message ? (
        <pre className="overflow-x-auto rounded-control border border-line bg-surface-muted p-3 text-micro text-muted">
          {message}
        </pre>
      ) : null}
    </main>
  );
}
