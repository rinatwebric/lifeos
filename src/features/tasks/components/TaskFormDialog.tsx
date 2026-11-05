import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useGoals, useMilestones } from "@/features/goals/hooks";
import { useCreateTask, useUpdateTask } from "@/features/tasks/hooks";
import { useCreateRecurringTask } from "@/features/tasks/recurrence/hooks";
import {
  createTaskFormSchemas,
  type CreateTaskInput,
} from "@/features/tasks/schema";
import { isoToLocalDateTime, localDateTimeToIso, toDateKey } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useRevalidateOnLocaleChange } from "@/lib/i18n/useRevalidate";
import { PRIORITIES, TASK_STATUSES, type RecurrenceFrequency, type Task } from "@/types/domain";

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `null` → create mode; a task → edit mode. */
  task: Task | null;
  /** Profile time zone: datetime-local inputs convert only through it. */
  timeZone: string;
}

type TaskFormValues = CreateTaskInput;

const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

function defaultValuesFor(task: Task | null): TaskFormValues {
  if (task) {
    return {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      estimatedDurationMinutes: task.estimatedDurationMinutes,
      goalId: task.goalId,
      milestoneId: task.milestoneId,
    };
  }

  return {
    title: "",
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: null,
    goalId: null,
    milestoneId: null,
  };
}

const nullIfEmpty = (value: unknown): string | null | unknown =>
  value === "" ? null : value;

export function TaskFormDialog({ open, onClose, task, timeZone }: TaskFormDialogProps) {
  const m = useMessages();
  const t = m.tasks;
  const createTask = useCreateTask();
  const createRecurringTask = useCreateRecurringTask();
  const updateTask = useUpdateTask();
  const goalsQuery = useGoals();
  const [serverError, setServerError] = useState<string | null>(null);

  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RecurrenceFrequency>("daily");
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [repeatError, setRepeatError] = useState<string | null>(null);

  const schemas = useMemo(
    () =>
      createTaskFormSchemas({
        titleRequired: m.validation.titleRequired,
        titleTooLong: m.validation.titleTooLong,
        descriptionTooLong: m.validation.descriptionTooLong,
        dateFormat: m.validation.dateFormat,
        isoDateTime: m.validation.isoDateTime,
        scheduledEndAfterStart: m.validation.scheduledEndAfterStart,
        durationPositive: m.validation.durationPositive,
        validGoal: m.validation.validGoal,
        validMilestone: m.validation.validMilestone,
      }),
    [m.validation],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    trigger,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(
      task ? (schemas.updateTaskSchema as never) : (schemas.createTaskSchema as never),
    ) as Resolver<TaskFormValues>,
    defaultValues: defaultValuesFor(task),
  });

  useRevalidateOnLocaleChange(trigger, Object.keys(errors).length > 0);

  // RHF reads `defaultValues` only on first mount, but this dialog stays
  // mounted while `task`/`open` change. Re-sync on every open so Edit shows
  // the selected task and a fresh create never reuses the previous values.
  useEffect(() => {
    if (open) {
      reset(defaultValuesFor(task));
      setServerError(null);
      setRepeatEnabled(false);
      setRepeatFrequency("daily");
      setRepeatWeekdays(DEFAULT_WEEKDAYS);
      setRepeatEndDate("");
      setRepeatError(null);
    }
  }, [open, task, reset]);

  const selectedGoalId = watch("goalId") ?? null;
  const selectedMilestoneId = watch("milestoneId") ?? null;
  const scheduledStart = watch("scheduledStart") ?? null;
  const scheduledEnd = watch("scheduledEnd") ?? null;
  const milestonesQuery = useMilestones(selectedGoalId ?? undefined);

  const saving = createTask.isPending || createRecurringTask.isPending || updateTask.isPending;

  const toLocalInput = (iso: string | null): string => {
    if (!iso) {
      return "";
    }
    try {
      return isoToLocalDateTime(iso, timeZone);
    } catch {
      return "";
    }
  };

  const fromLocalInput = (value: string): string | null => {
    if (value === "") {
      return null;
    }
    try {
      return localDateTimeToIso(value, timeZone);
    } catch {
      return null;
    }
  };

  const handleGoalChange = (next: string | null): void => {
    const current = getValues("goalId") ?? null;
    setValue("goalId", next, { shouldValidate: true });
    // A milestone always lives under its goal: switching the goal must not
    // keep a milestone from the previous one (the service rejects/clears
    // orphans, but the form never sends one in the first place).
    if (next !== current) {
      setValue("milestoneId", null, { shouldValidate: true });
    }
  };

  const toggleWeekday = (day: number): void => {
    setRepeatWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  };

  const weekdayLabel = (value: number): string => {
    const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    return m.enums.weekdayShort[keys[value] ?? "mon"];
  };

  const onSubmit = async (values: TaskFormValues): Promise<void> => {
    setServerError(null);
    setRepeatError(null);
    try {
      if (task) {
        // Instance edits never carry the series: updateTask detaches
        // `recurrence_rule_id` server-side, the rule keeps generating.
        await updateTask.mutateAsync({ id: task.id, patch: values });
      } else if (repeatEnabled) {
        if (repeatFrequency === "weekdays" && repeatWeekdays.length === 0) {
          setRepeatError(t.weekdayRequired);
          return;
        }
        const startDate = values.dueDate ?? toDateKey(new Date(), timeZone);
        const endDate = repeatEndDate === "" ? null : repeatEndDate;
        if (endDate !== null && Date.parse(endDate) < Date.parse(startDate)) {
          setRepeatError(t.endDateAfterStart);
          return;
        }
        await createRecurringTask.mutateAsync({
          task: {
            title: values.title,
            description: values.description ?? null,
            priority: values.priority,
            status: values.status,
            dueDate: values.dueDate ?? null,
            scheduledStart: values.scheduledStart ?? null,
            scheduledEnd: values.scheduledEnd ?? null,
            estimatedDurationMinutes: values.estimatedDurationMinutes ?? null,
            goalId: values.goalId ?? null,
            milestoneId: values.milestoneId ?? null,
          },
          recurrence: {
            frequency: repeatFrequency,
            weekdays: repeatFrequency === "weekdays" ? repeatWeekdays : [],
            intervalValue: 1,
            endDate,
          },
          timeZone,
        });
      } else {
        await createTask.mutateAsync(values);
      }
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.saveTaskError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? tmpl(t.formEditTitle, { title: task.title }) : t.formNewTitle}
      description={task ? t.formEditDescription : t.formNewDescription}
      wide
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="task-title" label={t.fieldTitle} required error={errors.title?.message}>
          <Input data-autofocus placeholder={t.titlePlaceholder} {...register("title")} />
        </Field>

        <Field id="task-description" label={t.fieldDescription} error={errors.description?.message}>
          <Textarea
            placeholder={t.descriptionPlaceholder}
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="task-priority" label={t.fieldPriority} required error={errors.priority?.message}>
            <Select {...register("priority")}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {m.enums.priority[priority]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="task-status" label={t.fieldStatus} required error={errors.status?.message}>
            <Select {...register("status")}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {m.enums.status[status]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="task-goal"
            label={t.fieldGoal}
            hint={t.goalHint}
            error={errors.goalId?.message}
          >
            <Select
              value={selectedGoalId ?? ""}
              disabled={goalsQuery.isLoading}
              onChange={(event) =>
                handleGoalChange(event.target.value === "" ? null : event.target.value)
              }
            >
              <option value="">{t.noGoal}</option>
              {(goalsQuery.data ?? []).map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="task-milestone"
            label={t.fieldMilestone}
            hint={t.milestoneHint}
            error={errors.milestoneId?.message}
          >
            <Select
              value={selectedMilestoneId ?? ""}
              disabled={!selectedGoalId || milestonesQuery.isLoading}
              onChange={(event) =>
                setValue(
                  "milestoneId",
                  event.target.value === "" ? null : event.target.value,
                  { shouldValidate: true },
                )
              }
            >
              <option value="">{t.noMilestone}</option>
              {(milestonesQuery.data ?? []).map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="task-dueDate"
            label={t.fieldDueDate}
            hint={t.goalHint}
            error={errors.dueDate?.message}
          >
            <Input type="date" {...register("dueDate", { setValueAs: nullIfEmpty })} />
          </Field>

          <Field
            id="task-duration"
            label={t.fieldDuration}
            hint={t.goalHint}
            error={errors.estimatedDurationMinutes?.message}
          >
            <Input
              type="number"
              min={1}
              step={1}
              {...register("estimatedDurationMinutes", {
                setValueAs: (value: unknown) =>
                  value === "" || value === null || value === undefined ? null : Number(value),
              })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="task-scheduledStart"
            label={t.fieldScheduledStart}
            hint={t.goalHint}
            error={errors.scheduledStart?.message}
          >
            <Input
              type="datetime-local"
              value={toLocalInput(scheduledStart)}
              onChange={(event) =>
                setValue("scheduledStart", fromLocalInput(event.target.value), {
                  shouldValidate: true,
                })
              }
            />
          </Field>

          <Field
            id="task-scheduledEnd"
            label={t.fieldScheduledEnd}
            hint={t.scheduledEndHint}
            error={errors.scheduledEnd?.message}
          >
            <Input
              type="datetime-local"
              value={toLocalInput(scheduledEnd)}
              onChange={(event) =>
                setValue("scheduledEnd", fromLocalInput(event.target.value), {
                  shouldValidate: true,
                })
              }
            />
          </Field>
        </div>

        {task ? null : (
          <div className="space-y-3 rounded-card border border-line p-3">
            <label className="flex cursor-pointer items-center gap-2 text-ui font-medium text-content">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(event) => setRepeatEnabled(event.target.checked)}
                className="size-4 accent-current"
              />
              {t.repeat}
            </label>

            {repeatEnabled ? (
              <div className="space-y-3">
                <Field id="task-repeat-frequency" label={t.repeatFrequency} required>
                  <Select
                    value={repeatFrequency}
                    onChange={(event) =>
                      setRepeatFrequency(event.target.value as RecurrenceFrequency)
                    }
                  >
                    <option value="daily">{t.everyDay}</option>
                    <option value="weekdays">{t.specificDays}</option>
                    <option value="weekly">{t.everyWeek}</option>
                  </Select>
                </Field>

                {repeatFrequency === "weekdays" ? (
                  <fieldset>
                    <legend className="mb-1 block text-ui font-medium text-content">
                      {t.repeatDays}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_VALUES.map((value) => (
                        <label
                          key={value}
                          htmlFor={`task-repeat-weekday-${value}`}
                          className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-micro text-content"
                        >
                          <input
                            id={`task-repeat-weekday-${value}`}
                            type="checkbox"
                            checked={repeatWeekdays.includes(value)}
                            onChange={() => toggleWeekday(value)}
                            className="size-3.5 accent-current"
                          />
                          {weekdayLabel(value)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <Field
                  id="task-repeat-end"
                  label={t.repeatEnds}
                  hint={t.repeatEndsHint}
                >
                  <Input
                    type="date"
                    value={repeatEndDate}
                    onChange={(event) => setRepeatEndDate(event.target.value)}
                  />
                </Field>

                {repeatError ? (
                  <p role="alert" className="text-micro text-danger">
                    {repeatError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {task ? t.saveChanges : t.createTask}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
