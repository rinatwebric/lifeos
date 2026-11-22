import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/CheckCircle";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { isTaskOverdue } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useMessages } from "@/lib/i18n/I18nContext";
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

function formatTaskTime(value: string, timeZone: string, locale: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTaskDate(value: string, locale: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
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
  const m = useMessages();
  const t = m.tasks;
  const intl = useIntlLocale();

  const setStatus = useSetTaskStatus();

  const completed = task.status === "completed";
  const overdue = isTaskOverdue(task, new Date(), timeZone);
  const showPriorityBadge = task.priority === "high" || task.priority === "critical";
  const scheduledTime = task.scheduledStart
    ? formatTaskTime(task.scheduledStart, timeZone, intl)
    : null;

  const handleToggle = (): void => {
    if (setStatus.isPending) {
      return;
    }
    setStatus.mutate({ id: task.id, status: completed ? "todo" : "completed" });
  };

  return (
    <li className="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 px-5 py-4 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:items-center">
      <CheckCircle
        id={`task-${task.id}`}
        checked={completed}
        onChange={handleToggle}
        ariaLabel={
          completed
            ? tmpl(t.markIncomplete, { title: task.title })
            : tmpl(t.markComplete, { title: task.title })
        }
        className="-m-3.5 size-11 cursor-pointer self-start lg:self-center"
      />

      <div className="min-w-0 space-y-1.5">
        <p
          title={task.title}
          className={cn(
            "line-clamp-2 text-ui leading-snug break-words",
            completed ? "text-muted line-through" : "font-medium text-content",
          )}
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted">
          {task.goalId && goalTitle ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="break-words underline-offset-4 hover:text-content hover:underline"
            >
              {goalTitle}
            </Link>
          ) : null}
          {task.milestoneId && task.goalId && milestoneTitle ? (
            <>
              {goalTitle ? <span aria-hidden="true">·</span> : null}
              <Link
                to={`/goals/${task.goalId}`}
                className="break-words underline-offset-4 hover:text-content hover:underline"
              >
                {milestoneTitle}
              </Link>
            </>
          ) : null}
          {showPriorityBadge ? (
            <span className="font-medium text-content">
              {tmpl(t.priorityBadge, { priority: m.enums.priority[task.priority] })}
            </span>
          ) : null}
          {task.recurrenceRuleId ? <Badge tone="outline">{m.enums.repeat}</Badge> : null}
          {overdue ? <Badge tone="danger">{m.enums.overdue}</Badge> : null}
        </div>
        {setStatus.isError ? (
          <p role="alert" className="text-micro text-danger">
            {t.updateStatusError}
          </p>
        ) : null}
      </div>

      {task.dueDate || scheduledTime ? (
        <div className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted tabular-nums lg:col-start-auto lg:min-w-24 lg:flex-col lg:items-end lg:gap-y-0.5">
          {task.dueDate ? (
            <time dateTime={task.dueDate}>{formatTaskDate(task.dueDate, intl)}</time>
          ) : null}
          {task.dueDate && scheduledTime ? (
            <span aria-hidden="true" className="lg:hidden">
              ·
            </span>
          ) : null}
          {scheduledTime && task.scheduledStart ? (
            <time dateTime={task.scheduledStart}>{scheduledTime}</time>
          ) : null}
        </div>
      ) : null}

      <div className="col-start-2 flex items-center gap-0.5 lg:col-start-auto lg:justify-end lg:gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="relative size-11 shrink-0 gap-1.5 p-0 text-muted after:absolute after:-inset-1 after:content-[''] hover:bg-surface-muted hover:text-content lg:size-10 lg:gap-0 lg:px-0 xl:h-9 xl:w-auto xl:gap-1.5 xl:px-2.5"
          aria-label={t.edit}
          title={t.edit}
          onClick={() => onEdit(task)}
        >
          <Pencil className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t.edit}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative size-11 shrink-0 gap-1.5 p-0 text-muted after:absolute after:-inset-1 after:content-[''] hover:bg-surface-muted hover:text-content lg:size-10 lg:gap-0 lg:px-0 xl:h-9 xl:w-auto xl:gap-1.5 xl:px-2.5"
          aria-label={t.reschedule}
          title={t.reschedule}
          onClick={() => onReschedule(task)}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t.reschedule}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative size-11 shrink-0 gap-1.5 p-0 text-muted after:absolute after:-inset-1 after:content-[''] hover:bg-surface-muted hover:text-danger lg:size-10 lg:gap-0 lg:px-0 xl:h-9 xl:w-auto xl:gap-1.5 xl:px-2.5"
          onClick={() => onDelete(task)}
          aria-label={tmpl(t.deleteAria, { title: task.title })}
          title={t.delete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t.delete}</span>
        </Button>
      </div>
    </li>
  );
}
