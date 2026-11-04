import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";

import { ChatPanel } from "./ChatPanel";

export function AssistantPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistant"
        description="A planning partner that proposes next steps. Nothing changes until you review and confirm."
      />
      <p className="flex items-start gap-2 text-ui text-muted">
        <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          The assistant reads your goals and tasks to suggest plans. It never applies changes on its
          own — every proposal waits for your decision.
        </span>
      </p>
      <ChatPanel />
    </div>
  );
}
