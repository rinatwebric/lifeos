import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { isTaskOverdue } from "@/lib/dates";
import { humanize } from "@/lib/strings";
import { cn } from "@/lib/cn";
import type { Task } from "@/types/domain";

interface TaskRowProps {
  task: Task;
  timeZone: string;
  /** Goal title from the page-level goals list; null hides the goal link. */
  goalTitle: string | null;
  /** Milestone title from the page-level milestones fetch; null hides the link. */
  milestoneTitle: string | null;
  onEdit: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskRow({
  task,
  timeZone,
  goalTitle,
  milestoneTitle,
  onEdit,
  onReschedule,
  onDelete,
}: TaskRowProps) {
  const setStatus = useSetTaskStatus();

  const completed = task.status === "completed";
  const overdue = isTaskOverdue(task, new Date(), timeZone);
  const showPriorityBadge = task.priority === "high" || task.priority === "critical";

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
          {showPriorityBadge ? <Badge tone="outline">{humanize(task.priority)} priority</Badge> : null}
          {task.dueDate ? (
            <span className="text-xs text-muted">{task.dueDate}</span>
          ) : null}
          {overdue ? <Badge tone="danger">Overdue</Badge> : null}
          {task.goalId && goalTitle ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              {goalTitle}
            </Link>
          ) : null}
          {task.milestoneId && task.goalId && milestoneTitle ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="text-xs text-muted hover:underline"
            >
              {milestoneTitle}
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
