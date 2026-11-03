import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useMilestones } from "@/features/goals/hooks";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { isTaskOverdue } from "@/lib/dates";
import { humanize } from "@/lib/strings";
import { cn } from "@/lib/cn";
import type { Task } from "@/types/domain";

interface TaskRowProps {
  task: Task;
  timeZone: string;
  /** Goal title from the page-level goals list; null when the task has no goal. */
  goalTitle: string | null;
  onEdit: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskRow({ task, timeZone, goalTitle, onEdit, onReschedule, onDelete }: TaskRowProps) {
  const setStatus = useSetTaskStatus();
  // Milestone titles are not in the list payload (no N+1 per row: the query
  // is keyed by goal, so rows sharing a goal share one cached request).
  const milestonesQuery = useMilestones(task.goalId ?? undefined);

  const completed = task.status === "completed";
  const overdue = isTaskOverdue(task, new Date(), timeZone);
  const milestoneTitle =
    task.milestoneId != null
      ? (milestonesQuery.data?.find((milestone) => milestone.id === task.milestoneId)?.title ?? null)
      : null;

  const handleToggle = (): void => {
    if (setStatus.isPending) {
      return;
    }
    setStatus.mutate({ id: task.id, status: completed ? "todo" : "completed" });
  };

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        completed && "opacity-70",
      )}
    >
      <input
        type="checkbox"
        checked={completed}
        onChange={handleToggle}
        aria-label={completed ? `Mark ${task.title} as not completed` : `Mark ${task.title} as completed`}
        className="mt-0.5 size-4 shrink-0 accent-current"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          className={
            completed
              ? "truncate text-sm text-muted line-through"
              : "truncate text-sm font-medium text-content"
          }
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{humanize(task.priority)} priority</Badge>
          {task.dueDate ? (
            <span className="text-xs text-muted">{task.dueDate}</span>
          ) : null}
          {overdue ? <Badge tone="danger">Overdue</Badge> : null}
          {task.goalId ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              {goalTitle ?? "View goal"}
            </Link>
          ) : null}
          {task.milestoneId && task.goalId ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="text-xs text-muted hover:underline"
            >
              {milestoneTitle ?? "Milestone"}
            </Link>
          ) : null}
        </div>
        {setStatus.isError ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            Could not update the status. Please try again.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onReschedule(task)}>
          Reschedule
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(task)}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
