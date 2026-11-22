import { Archive, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useUpdateGoal } from "@/features/goals/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Goal } from "@/types/domain";

interface GoalCardProps {
  goal: Goal;
  progress: number;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

function formatDateRange(goal: Goal, started: (vars: Record<string, string>) => string): string {
  if (goal.targetDate) {
    return `${goal.startDate} – ${goal.targetDate}`;
  }
  return started({ date: goal.startDate });
}

export function GoalCard({ goal, progress, onEdit, onDelete }: GoalCardProps) {
  const m = useMessages();
  const t = m.goals;
  const updateGoal = useUpdateGoal();

  const handleArchive = (): void => {
    if (goal.status === "archived" || updateGoal.isPending) {
      return;
    }
    updateGoal.mutate({ id: goal.id, patch: { status: "archived" } });
  };

  return (
    <Card className="flex h-full flex-col p-0">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-body leading-snug font-semibold text-content">
            <Link
              to={`/goals/${goal.id}`}
              className="line-clamp-2 underline-offset-4 hover:underline"
              title={goal.title}
            >
              {goal.title}
            </Link>
          </h3>
          <Badge tone="neutral" className="shrink-0">
            {m.enums.status[goal.status]}
          </Badge>
        </div>

        {goal.description ? (
          <p className="line-clamp-2 text-caption leading-relaxed text-muted break-words">
            {goal.description}
          </p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-content tabular-nums">
              {tmpl(t.percentComplete, { percent: progress })}
            </span>
            <span className="text-micro text-muted">
              {goal.progressMode === "milestones" ? t.fromMilestones : t.manual}
            </span>
          </div>
          <ProgressBar
            value={progress}
            tone="neutral"
            label={tmpl(t.progressLabel, { title: goal.title })}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="text-micro text-muted">{t.filtersCategory}</dt>
            <dd
              className="mt-0.5 truncate text-caption text-content"
              title={m.enums.category[goal.category]}
            >
              {m.enums.category[goal.category]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-micro text-muted">{t.filtersPriority}</dt>
            <dd className="mt-0.5 truncate text-caption text-content">
              {m.enums.priority[goal.priority]}
            </dd>
          </div>
        </dl>

        <p className="mt-auto text-micro text-muted tabular-nums">
          {formatDateRange(goal, (vars) => tmpl(t.started, vars))}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3">
        <Button
          variant="secondary"
          size="sm"
          className="relative min-h-9 shrink-0 px-2 text-[12px] after:absolute after:-inset-1 after:content-[''] sm:px-3"
          onClick={() => onEdit(goal)}
          aria-label={t.edit}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t.edit}</span>
        </Button>
        {goal.status === "archived" ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="relative min-h-9 shrink-0 px-2 text-[12px] after:absolute after:-inset-1 after:content-[''] sm:px-3"
            onClick={handleArchive}
            loading={updateGoal.isPending}
            aria-label={t.archive}
          >
            <Archive className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t.archive}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="relative min-h-9 shrink-0 px-2 text-[12px] after:absolute after:-inset-1 after:content-[''] sm:px-3"
          onClick={() => onDelete(goal)}
          aria-label={tmpl(t.deleteAria, { title: goal.title })}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t.delete}</span>
        </Button>
      </div>
    </Card>
  );
}
