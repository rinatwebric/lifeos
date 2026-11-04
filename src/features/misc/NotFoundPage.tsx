import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function NotFoundPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Page not found"
        description="This route does not exist in LifeOS. It may have been renamed or not built yet."
      />

      <Card>
        <EmptyState
          icon={Compass}
          title="404"
          description="Check the address or head back to your dashboard."
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-control bg-accent px-3 py-1.5 text-ui font-medium text-accent-content"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to dashboard
            </Link>
          }
        />
      </Card>
    </div>
  );
}
