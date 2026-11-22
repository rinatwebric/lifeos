import { Check } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { HabitActionsMenu } from "@/features/habits/components/HabitActionsMenu";
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

  const targetLabel = tmpl(habit.frequency === "weekly" ? t.targetPerWeek : t.targetPerDay, {
    count: habit.targetCount,
  });

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
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 px-5 py-4 transition-colors duration-fast hover:bg-surface-raised/40 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.85fr)_auto] lg:items-center",
        archived && "opacity-70",
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="size-11 shrink-0 justify-center bg-surface-muted p-0 text-content hover:bg-surface-raised lg:min-h-9 lg:w-auto lg:justify-start lg:gap-2 lg:px-3"
        aria-label={tmpl(t.logAria, { title: habit.title })}
        title={t.log}
        onClick={() => onLog(habit)}
      >
        <Check className="size-4" aria-hidden="true" />
        <span className="hidden lg:inline">{t.log}</span>
      </Button>

      <div className="min-w-0 space-y-1.5">
        <p title={habit.title} className="truncate text-ui font-medium text-content">
          {habit.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
          <span>{frequencyLabel}</span>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums">{targetLabel}</span>
          {paused ? <Badge tone="outline">{m.enums.status.paused}</Badge> : null}
          {archived ? <Badge tone="outline">{m.enums.status.archived}</Badge> : null}
        </div>
      </div>

      <div className="col-start-2 flex flex-wrap gap-x-5 gap-y-1 text-caption lg:col-start-auto lg:shrink-0">
        <span
          className={cn("tabular-nums", stats.currentStreak > 0 ? "text-accent" : "text-muted")}
        >
          {streakLabel}
        </span>
        {stats.completionRate === null ? (
          <span className="text-muted">{t.noPlannedDays}</span>
        ) : (
          <span className="text-muted tabular-nums">
            {tmpl(t.completion, { rate: stats.completionRate })}
          </span>
        )}
      </div>

      <div className="col-start-3 row-start-1 lg:col-start-auto lg:row-start-auto">
        <HabitActionsMenu
          habit={habit}
          onEdit={onEdit}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}
