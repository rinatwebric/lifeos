import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { useMessages } from "@/lib/i18n/I18nContext";

import { ChatPanel } from "./ChatPanel";

export function AssistantPage() {
  const m = useMessages();
  const t = m.assistant;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
      />
      <p className="flex items-start gap-2 text-ui text-muted">
        <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {t.hint}
        </span>
      </p>
      <ChatPanel />
    </div>
  );
}
