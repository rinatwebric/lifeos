import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { HabitStats } from "@/lib/habits";
import { humanize } from "@/lib/strings";
import type { Habit } from "@/types/domain";

interface HabitRowProps {
  habit: Habit;
  stats: HabitStats;
  onLog: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onTogglePause: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}

function streakLabel(stats: HabitStats, unit: string): string {
  if (stats.currentStreak === 0 && stats.bestStreak === 0) {
    return "No streak yet";
  }

  const unitLabel = stats.currentStreak === 1 ? unit : `${unit}s`;
  return `${stats.currentStreak}-${unitLabel} streak · best ${stats.bestStreak}`;
}

export function HabitRow({ habit, stats, onLog, onEdit, onTogglePause, onDelete }: HabitRowProps) {
  const unit = habit.frequency === "weekly" ? "week" : "day";
  const paused = habit.status === "paused";
  const archived = habit.status === "archived";

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", archived && "opacity-70")}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p title={habit.title} className="truncate text-ui font-medium text-content">
          {habit.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{humanize(habit.frequency)}</Badge>
          <span className="text-micro text-muted tabular-nums">
            Target {habit.targetCount}
            {habit.frequency === "weekly" ? " / week" : " / day"}
          </span>
          {paused ? <Badge tone="outline">Paused</Badge> : null}
          {archived ? <Badge tone="outline">Archived</Badge> : null}
          <Badge tone="accent">{streakLabel(stats, unit)}</Badge>
          {stats.completionRate === null ? (
            <span className="text-micro text-muted">No planned days yet</span>
          ) : (
            <span className="text-micro text-muted tabular-nums">{stats.completionRate}% completion</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onLog(habit)}
        >
          Log
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onEdit(habit)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onTogglePause(habit)}
          aria-label={paused || archived ? `Resume ${habit.title}` : `Pause ${habit.title}`}
        >
          {paused || archived ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onDelete(habit)}
          aria-label={`Delete ${habit.title}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
