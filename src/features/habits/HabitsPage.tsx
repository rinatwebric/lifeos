import { Repeat2 } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function HabitsPage() {
  return (
    <PhasePlaceholder
      title="Habits"
      description="Small recurring actions, tracked without punishment for missed days."
      icon={Repeat2}
      phase="Phase 5 — Habits & Analytics"
      detail="Habit definitions, daily logs, current and best streaks, and completion rates that distinguish a missed day from a day the habit was not scheduled."
      footer="Habit history is never deleted when a habit is paused or a day is missed."
    />
  );
}
