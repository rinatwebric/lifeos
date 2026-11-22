import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMessages } from "@/lib/i18n/I18nContext";

export function NotFoundPage() {
  const m = useMessages();

  return (
    <div className="space-y-6">
      <PageHeader title={m.notFound.title} description={m.notFound.description} />

      <div className="max-w-lg">
        <EmptyState
          icon={Compass}
          title={m.notFound.code}
          description={m.notFound.hint}
          action={
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-content px-5 text-ui font-medium text-canvas transition-[opacity,scale] duration-fast ease-standard hover:opacity-90 motion-safe:active:scale-[0.96]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {m.notFound.back}
            </Link>
          }
        />
      </div>
    </div>
  );
}
