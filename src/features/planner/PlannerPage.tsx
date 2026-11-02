import { CalendarDays } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function PlannerPage() {
  return (
    <PhasePlaceholder
      title="Planner"
      description="Distribute tasks across the time you actually have, without double-booking yourself."
      icon={CalendarDays}
      phase="Phase 3 — Planner"
      detail="Day and week views, working hours, time blocks, conflict detection and a scheduler that explains why each slot was chosen."
      footer="Constraints: no overlapping blocks, nothing scheduled during sleep, no tasks in the past, and no silent changes to existing blocks."
    />
  );
}
