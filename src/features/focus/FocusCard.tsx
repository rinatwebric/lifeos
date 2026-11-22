import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Square, Timer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { formatDurationMinutes } from "@/features/planner/usePlannerDay";
import { listTasks } from "@/features/tasks/api";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { tasks } from "@/features/tasks/queryKeys";
import { cn } from "@/lib/cn";
import { tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

import { focusErrorCode, type FocusErrorCode } from "./errors";
import {
  useActiveFocusSession,
  useCompleteFocusSession,
  usePauseFocusSession,
  useResumeFocusSession,
  useStartFocusSession,
} from "./hooks";
import { FOCUS_PRESET_MINUTES, focusClock, formatFocusClock } from "./timer";
import { useFocusNow } from "./useFocusNow";

interface FocusCardProps {
  nextTask: Task | null;
}

function errorCopy(
  code: FocusErrorCode | null,
  t: ReturnType<typeof useMessages>["focus"],
): string {
  switch (code) {
    case "active_exists":
      return t.activeExists;
    case "network":
      return t.networkError;
    case "forbidden":
    case "not_found":
      return t.actionError;
    default:
      return t.actionError;
  }
}

export function FocusCard({ nextTask }: FocusCardProps) {
  const m = useMessages();
  const t = m.focus;
  const locale = useLocale();
  const activeQuery = useActiveFocusSession();
  const startMutation = useStartFocusSession();
  const pauseMutation = usePauseFocusSession();
  const resumeMutation = useResumeFocusSession();
  const completeMutation = useCompleteFocusSession();
  const { mutate: setTaskStatus } = useSetTaskStatus();
  const [preset, setPreset] = useState<number>(FOCUS_PRESET_MINUTES[0]);
  const [completedSeconds, setCompletedSeconds] = useState<number | null>(null);
  const [actionError, setActionError] = useState<FocusErrorCode | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const intl = useIntlLocale();
  const pickerQuery = useQuery({
    queryKey: tasks.list({ statuses: ["todo", "in_progress"] }),
    queryFn: () => listTasks({ statuses: ["todo", "in_progress"] }),
    enabled: pickerOpen,
    staleTime: 30_000,
  });

  const active = activeQuery.data ?? null;
  const focusTask = selectedTask ?? nextTask;
  const now = useFocusNow(active);
  const clock = active ? focusClock(active, now) : null;
  const pending =
    startMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    completeMutation.isPending;
  const mutationError =
    actionError ??
    focusErrorCode(
      startMutation.error ??
        pauseMutation.error ??
        resumeMutation.error ??
        completeMutation.error ??
        null,
    );

  const clearErrors = (): void => {
    setActionError(null);
    startMutation.reset();
    pauseMutation.reset();
    resumeMutation.reset();
    completeMutation.reset();
  };

  const start = async (): Promise<void> => {
    if (!focusTask || pending) return;
    clearErrors();
    setCompletedSeconds(null);
    try {
      await startMutation.mutateAsync({
        taskId: focusTask.id,
        plannedMinutes: preset,
      });
      if (focusTask.status === "todo") {
        setTaskStatus({ id: focusTask.id, status: "in_progress" });
      }
    } catch (error) {
      setActionError(focusErrorCode(error));
    }
  };

  const chooseTask = (task: Task): void => {
    setSelectedTask(task);
    setCompletedSeconds(null);
    setActionError(null);
    setPickerOpen(false);
  };

  const formatDueDate = (value: string): string => {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(intl, { month: "short", day: "numeric" }).format(date);
  };

  const pause = async (): Promise<void> => {
    if (!active || pending) return;
    clearErrors();
    try {
      await pauseMutation.mutateAsync(active.id);
    } catch (error) {
      setActionError(focusErrorCode(error));
    }
  };

  const resume = async (): Promise<void> => {
    if (!active || pending) return;
    clearErrors();
    try {
      await resumeMutation.mutateAsync(active.id);
    } catch (error) {
      setActionError(focusErrorCode(error));
    }
  };

  const finish = async (): Promise<void> => {
    if (!active || pending || !clock) return;
    clearErrors();
    const elapsed = clock.elapsedSeconds;
    try {
      await completeMutation.mutateAsync(active.id);
      setCompletedSeconds(elapsed);
    } catch (error) {
      setActionError(focusErrorCode(error));
    }
  };

  if (activeQuery.isLoading) {
    if (!focusTask) return null;
    return (
      <Card className="p-5 sm:p-6">
        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          aria-busy="true"
        >
          <div className="space-y-2">
            <div className="h-2.5 w-16 rounded-full bg-surface-muted" />
            <div className="h-4 w-56 max-w-full rounded-full bg-surface-muted" />
          </div>
          <div className="h-9 w-32 rounded-pill bg-surface-muted" />
        </div>
        <span className="sr-only">{t.loading}</span>
      </Card>
    );
  }

  if (activeQuery.isError) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-ui font-medium text-content">{t.loadError}</p>
          <p className="mt-1 text-caption text-muted">{t.loadErrorHint}</p>
        </div>
        <Button variant="secondary" size="lg" onClick={() => void activeQuery.refetch()}>
          {m.common.retry}
        </Button>
      </Card>
    );
  }

  if (!active) {
    return (
      <>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-micro font-medium text-muted">
                <Timer className="size-3.5" aria-hidden="true" />
                {t.label}
              </p>
              {focusTask ? (
                <>
                  <p className="mt-1.5 text-[18px] leading-snug font-medium break-words text-content">
                    {focusTask.title}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                    <span>
                      {selectedTask ? t.focusTaskLabel : t.nextTask}
                      {focusTask.estimatedDurationMinutes
                        ? ` · ${formatDurationMinutes(focusTask.estimatedDurationMinutes, locale)}`
                        : null}
                    </span>
                    <button
                      type="button"
                      className="underline-offset-4 hover:text-content hover:underline"
                      onClick={() => setPickerOpen(true)}
                    >
                      {t.changeTask}
                    </button>
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-[18px] leading-snug font-medium text-content">
                  {completedSeconds !== null ? t.completedTitle : t.noTask}
                </p>
              )}
              {completedSeconds !== null ? (
                <p role="status" className="mt-1 text-caption text-muted">
                  {tmpl(t.completed, {
                    duration:
                      completedSeconds < 60 ? t.underMinute : formatFocusClock(completedSeconds),
                  })}
                </p>
              ) : null}
              {mutationError ? (
                <p role="alert" className="mt-2 text-caption text-danger">
                  {errorCopy(mutationError, t)}
                </p>
              ) : null}
            </div>

            {focusTask ? (
              <div className="flex shrink-0 flex-col gap-3 sm:items-end">
                <div
                  className="inline-flex w-fit items-center gap-1 rounded-control bg-surface-muted p-1"
                  role="group"
                  aria-label={t.presetsLabel}
                >
                  {FOCUS_PRESET_MINUTES.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={preset === minutes}
                      disabled={pending}
                      onClick={() => setPreset(minutes)}
                      className={cn(
                        "min-h-8 rounded-pill px-3 text-micro font-medium tabular-nums transition-[background-color,color] duration-fast ease-standard",
                        preset === minutes
                          ? "bg-surface text-content"
                          : "text-muted hover:text-content",
                      )}
                    >
                      {formatDurationMinutes(minutes, locale)}
                    </button>
                  ))}
                </div>
                <Button
                  size="lg"
                  className="min-h-11"
                  disabled={pending}
                  loading={startMutation.isPending}
                  onClick={() => void start()}
                >
                  {startMutation.isPending
                    ? t.starting
                    : tmpl(t.startWithMinutes, {
                        duration: formatDurationMinutes(preset, locale),
                      })}
                </Button>
              </div>
            ) : completedSeconds === null ? (
              <Button
                variant="secondary"
                size="lg"
                className="min-h-11 shrink-0"
                onClick={() => setPickerOpen(true)}
              >
                {t.chooseTask}
              </Button>
            ) : null}
          </div>
        </Card>

        <Dialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={t.pickTitle}
          description={t.pickDescription}
        >
          {pickerQuery.isLoading ? (
            <p role="status" className="text-ui text-muted">
              {t.pickLoading}
            </p>
          ) : pickerQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="alert" className="text-ui text-muted">
                {t.pickError}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void pickerQuery.refetch()}>
                {m.common.retry}
              </Button>
            </div>
          ) : (pickerQuery.data ?? []).length === 0 ? (
            <div className="space-y-3">
              <p className="text-ui text-muted">{t.pickEmpty}</p>
              <Link
                to="/tasks?new=1"
                onClick={() => setPickerOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-pill bg-content px-4 text-ui font-medium text-canvas"
              >
                {t.pickEmptyCta}
              </Link>
            </div>
          ) : (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
              {(pickerQuery.data ?? []).map((task, index) => (
                <li key={task.id}>
                  <button
                    type="button"
                    data-autofocus={index === 0 ? true : undefined}
                    onClick={() => chooseTask(task)}
                    className="flex w-full flex-col gap-0.5 rounded-control px-3 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted"
                  >
                    <span className="text-ui font-medium text-content">{task.title}</span>
                    <span className="text-caption text-muted">
                      {task.dueDate ? formatDueDate(task.dueDate) : t.noDueDate}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end border-t border-line pt-4">
            <Button variant="secondary" size="lg" onClick={() => setPickerOpen(false)}>
              {m.common.cancel}
            </Button>
          </div>
        </Dialog>
      </>
    );
  }

  if (!clock) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-micro font-medium text-muted">
            <span
              className={cn("size-1.5 rounded-full", active.pausedAt ? "bg-muted" : "bg-accent")}
              aria-hidden="true"
            />
            {active.pausedAt ? t.paused : t.running}
          </p>
          <p className="mt-1.5 text-[18px] leading-snug font-medium break-words text-content">
            {active.taskTitle ?? t.untitled}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p
              className="text-[32px] leading-none font-semibold tracking-[-0.03em] text-content tabular-nums"
              aria-label={`${t.elapsed}: ${clock.formatted}`}
            >
              {clock.formatted}
            </p>
            <p className="text-caption text-muted tabular-nums">
              {tmpl(t.plannedFor, {
                duration: formatDurationMinutes(active.plannedMinutes, locale),
              })}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label={t.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clock.progress)}
            className="mt-3 h-1 max-w-md overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-slow ease-standard motion-reduce:transition-none"
              style={{ width: `${clock.progress}%` }}
            />
          </div>
          <p className="mt-2 text-micro text-muted tabular-nums">
            {clock.overtimeSeconds > 0
              ? tmpl(t.overPlan, {
                  duration: formatDurationMinutes(clock.overtimeSeconds / 60, locale),
                })
              : tmpl(t.remaining, {
                  duration: formatFocusClock(Math.max(0, clock.remainingSeconds)),
                })}
          </p>
          {mutationError ? (
            <p role="alert" className="mt-2 text-caption text-danger">
              {errorCopy(mutationError, t)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Button
            variant="secondary"
            size="lg"
            className="min-h-11"
            disabled={pending}
            loading={pauseMutation.isPending || resumeMutation.isPending}
            onClick={() => void (active.pausedAt ? resume() : pause())}
          >
            {active.pausedAt ? (
              <Play className="size-3.5" aria-hidden="true" />
            ) : (
              <Pause className="size-3.5" aria-hidden="true" />
            )}
            {active.pausedAt ? t.resume : t.pause}
          </Button>
          <Button
            size="lg"
            className="min-h-11"
            disabled={pending}
            loading={completeMutation.isPending}
            onClick={() => void finish()}
          >
            <Square className="size-3.5" aria-hidden="true" />
            {completeMutation.isPending ? t.finishing : t.finish}
          </Button>
        </div>
      </div>
    </Card>
  );
}
