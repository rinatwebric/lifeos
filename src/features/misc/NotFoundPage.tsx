import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMessages } from "@/lib/i18n/I18nContext";

export function NotFoundPage() {
  const m = useMessages();

  return (
    <div className="space-y-6">
      <PageHeader title={m.notFound.title} description={m.notFound.description} />

      <Card>
        <EmptyState
          icon={Compass}
          title={m.notFound.code}
          description={m.notFound.hint}
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-control bg-accent px-3 py-1.5 text-ui font-medium text-accent-content"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {m.notFound.back}
            </Link>
          }
        />
      </Card>
    </div>
  );
}
