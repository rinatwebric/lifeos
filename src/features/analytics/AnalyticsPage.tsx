import { BarChart3 } from "lucide-react";

import { PhasePlaceholder } from "@/components/ui/PhasePlaceholder";

export function AnalyticsPage() {
  return (
    <PhasePlaceholder
      title="Analytics"
      description="Whether your daily actions are moving you toward your goals — not just how many boxes you ticked."
      icon={BarChart3}
      phase="Phase 5 — Habits & Analytics"
      detail="Completed, pending and overdue tasks, goal completion, weekly completion rate and habit consistency, with day/week/month/year ranges."
      footer="Analytics only ever reads real user data. Empty periods show as empty states, not as failures."
    />
  );
}