import { AlertTriangle, RotateCw } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 p-4 sm:p-6">
      <p className="text-micro tracking-wide text-muted uppercase">{m.routeError.eyebrow}</p>

      <Card>
        <EmptyState
          icon={AlertTriangle}
          title={m.routeError.title}
          description={m.routeError.description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="lg" onClick={() => window.location.reload()}>
                <RotateCw className="size-4" aria-hidden="true" />
                {m.routeError.reload}
              </Button>
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-control border border-line px-3 text-ui font-medium text-content hover:bg-surface-muted"
              >
                {m.routeError.backToDashboard}
              </Link>
            </div>
          }
        />
      </Card>

      {import.meta.env.DEV && message ? (
        <pre className="overflow-x-auto rounded-control border border-line bg-surface-muted p-3 text-micro text-muted">
          {message}
        </pre>
      ) : null}
    </main>
  );
}
