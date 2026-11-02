import { ListChecks } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function TasksPage() {
  return (
    <PhasePlaceholder
      title="Tasks"
      description="Daily execution: what to do, when, and how it connects to your goals."
      icon={ListChecks}
      phase="Phase 2 — Goals & Tasks"
      detail="Task CRUD, priorities, statuses, goal and milestone links, recurrence instances and filtering. Overdue detection is already time-zone aware."
      footer="Overdue is a derived state (due date earlier than today in your time zone), never a stored status."
    />
  );
}
