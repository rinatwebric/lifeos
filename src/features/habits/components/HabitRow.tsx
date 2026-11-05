import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { HabitStats } from "@/lib/habits";
import type { Habit } from "@/types/domain";

interface HabitRowProps {
  habit: Habit;
  stats: HabitStats;
  onLog: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onTogglePause: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}

export function HabitRow({ habit, stats, onLog, onEdit, onTogglePause, onDelete }: HabitRowProps) {
  const locale = useLocale();
  const m = useMessages();
  const t = m.habits.row;

  const paused = habit.status === "paused";
  const archived = habit.status === "archived";

  const frequencyLabel =
    habit.frequency === "daily"
      ? t.frequencyDaily
      : habit.frequency === "weekly"
        ? t.frequencyWeekly
        : t.frequencyWeekdays;

  const targetLabel = tmpl(
    habit.frequency === "weekly" ? t.targetPerWeek : t.targetPerDay,
    { count: habit.targetCount },
  );

  const streakLabel = (() => {
    if (stats.currentStreak === 0 && stats.bestStreak === 0) {
      return t.noStreak;
    }
    const weekly = habit.frequency === "weekly";
    const cat = pluralCategory(locale, stats.currentStreak);
    const tpl = weekly
      ? cat === "one"
        ? t.streakWeekOne
        : cat === "few"
          ? t.streakWeekFew
          : t.streakWeekMany
      : cat === "one"
        ? t.streakDayOne
        : cat === "few"
          ? t.streakDayFew
          : t.streakDayMany;
    return tmpl(tpl, { current: stats.currentStreak, best: stats.bestStreak });
  })();

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", archived && "opacity-70")}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p title={habit.title} className="truncate text-ui font-medium text-content">
          {habit.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{frequencyLabel}</Badge>
          <span className="text-micro text-muted tabular-nums">{targetLabel}</span>
          {paused ? <Badge tone="outline">{m.enums.status.paused}</Badge> : null}
          {archived ? <Badge tone="outline">{m.enums.status.archived}</Badge> : null}
          <Badge tone="accent">{streakLabel}</Badge>
          {stats.completionRate === null ? (
            <span className="text-micro text-muted">{t.noPlannedDays}</span>
          ) : (
            <span className="text-micro text-muted tabular-nums">
              {tmpl(t.completion, { rate: stats.completionRate })}
            </span>
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
          {t.log}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onEdit(habit)}
        >
          {t.edit}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onTogglePause(habit)}
          aria-label={tmpl(paused || archived ? t.resumeAria : t.pauseAria, { title: habit.title })}
        >
          {paused || archived ? t.resume : t.pause}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:-inset-1 after:content-['']"
          onClick={() => onDelete(habit)}
          aria-label={tmpl(t.deleteAria, { title: habit.title })}
        >
          {t.delete}
        </Button>
      </div>
    </li>
  );
}
