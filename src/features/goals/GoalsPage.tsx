import { Target } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function GoalsPage() {
  return (
    <PhasePlaceholder
      title="Goals"
      description="Long-term outcomes, broken into milestones you can actually execute."
      icon={Target}
      phase="Phase 2 — Goals & Tasks"
      detail="Creating, editing, pausing and archiving goals with milestone-based progress. Entity types and the progress formulas are already implemented and unit-tested."
      footer="Progress rule: completed milestones / total milestones × 100, or a manual value when a goal has no milestones."
    />
  );
}
