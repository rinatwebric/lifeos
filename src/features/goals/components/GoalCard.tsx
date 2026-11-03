import { Archive, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useUpdateGoal } from "@/features/goals/hooks";
import { humanize } from "@/lib/strings";
import type { Goal, GoalStatus } from "@/types/domain";

interface GoalCardProps {
  goal: Goal;
  progress: number;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

const STATUS_TONE: Record<GoalStatus, "accent" | "neutral" | "outline"> = {
  active: "accent",
  completed: "neutral",
  not_started: "outline",
  paused: "outline",
  archived: "outline",
};

function formatDateRange(goal: Goal): string {
  if (goal.targetDate) {
    return `${goal.startDate} – ${goal.targetDate}`;
  }
  return `Started ${goal.startDate}`;
}

export function GoalCard({ goal, progress, onEdit, onDelete }: GoalCardProps) {
  const updateGoal = useUpdateGoal();

  const handleArchive = (): void => {
    if (goal.status === "archived" || updateGoal.isPending) {
      return;
    }
    updateGoal.mutate({ id: goal.id, patch: { status: "archived" } });
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-content">
          <Link to={`/goals/${goal.id}`} className="hover:underline">
            {goal.title}
          </Link>
        </h3>
        <Badge tone={STATUS_TONE[goal.status]}>{humanize(goal.status)}</Badge>
      </div>

      {goal.description ? <p className="text-sm text-muted">{goal.description}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        <Badge>{humanize(goal.category)}</Badge>
        <Badge tone="outline">{humanize(goal.priority)} priority</Badge>
      </div>

      <div className="space-y-1">
        <ProgressBar value={progress} label={`Progress for ${goal.title}`} />
        <p className="text-xs text-muted">
          {`${progress}% complete`}
          {goal.progressMode === "milestones" ? " · from milestones" : " · manual"}
        </p>
      </div>

      <p className="text-xs text-muted">{formatDateRange(goal)}</p>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={() => onEdit(goal)}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>
        {goal.status === "archived" ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            loading={updateGoal.isPending}
          >
            <Archive className="size-3.5" aria-hidden="true" />
            Archive
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onDelete(goal)} aria-label={`Delete ${goal.title}`}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </Card>
  );
}
