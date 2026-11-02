import { Sparkles } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function AssistantPage() {
  return (
    <PhasePlaceholder
      title="AI Assistant"
      description="A planning partner that proposes changes — you stay in control of every decision."
      icon={Sparkles}
      phase="Phase 4 — AI Assistant"
      detail="Server-side AI service with a controlled tool layer (read-only context, proposal-only writes), structured JSON responses and a human approval step before anything changes."
      footer="The AI never gets direct database access and never applies changes without explicit confirmation."
    />
  );
}
