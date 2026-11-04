import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
} from "@/features/tasks/schema";
import { isoToLocalDateTime, localDateTimeToIso, toDateKey } from "@/lib/dates";
import { humanize } from "@/lib/strings";
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

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(task ? updateTaskSchema : createTaskSchema) as Resolver<TaskFormValues>,
    defaultValues: defaultValuesFor(task),
  });

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
          setRepeatError("Choose at least one weekday.");
          return;
        }
        const startDate = values.dueDate ?? toDateKey(new Date(), timeZone);
        const endDate = repeatEndDate === "" ? null : repeatEndDate;
        if (endDate !== null && Date.parse(endDate) < Date.parse(startDate)) {
          setRepeatError("End date must not be before the start date.");
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
      setServerError(error instanceof Error ? error.message : "Could not save the task.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? `Edit ${task.title}` : "New task"}
      description={
        task ? "Update the task details below." : "Capture a concrete next action."
      }
      wide
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="task-title" label="Title" required error={errors.title?.message}>
          <Input data-autofocus placeholder="Write the report" {...register("title")} />
        </Field>

        <Field id="task-description" label="Description" error={errors.description?.message}>
          <Textarea
            placeholder="What does done look like?"
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="task-priority" label="Priority" required error={errors.priority?.message}>
            <Select {...register("priority")}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {humanize(priority)}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="task-status" label="Status" required error={errors.status?.message}>
            <Select {...register("status")}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="task-goal"
            label="Goal"
            hint="Optional."
            error={errors.goalId?.message}
          >
            <Select
              value={selectedGoalId ?? ""}
              disabled={goalsQuery.isLoading}
              onChange={(event) =>
                handleGoalChange(event.target.value === "" ? null : event.target.value)
              }
            >
              <option value="">No goal</option>
              {(goalsQuery.data ?? []).map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="task-milestone"
            label="Milestone"
            hint="Optional. Clears when the goal changes."
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
              <option value="">No milestone</option>
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
            label="Due date"
            hint="Optional."
            error={errors.dueDate?.message}
          >
            <Input type="date" {...register("dueDate", { setValueAs: nullIfEmpty })} />
          </Field>

          <Field
            id="task-duration"
            label="Estimated duration (minutes)"
            hint="Optional."
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
            label="Scheduled start"
            hint="Optional."
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
            label="Scheduled end"
            hint="Must be after the start."
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
              Repeat
            </label>

            {repeatEnabled ? (
              <div className="space-y-3">
                <Field id="task-repeat-frequency" label="Frequency" required>
                  <Select
                    value={repeatFrequency}
                    onChange={(event) =>
                      setRepeatFrequency(event.target.value as RecurrenceFrequency)
                    }
                  >
                    <option value="daily">Every day</option>
                    <option value="weekdays">Specific days of the week</option>
                    <option value="weekly">Every week</option>
                  </Select>
                </Field>

                {repeatFrequency === "weekdays" ? (
                  <fieldset>
                    <legend className="mb-1 block text-ui font-medium text-content">
                      Days of the week
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          htmlFor={`task-repeat-weekday-${option.value}`}
                          className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-micro text-content"
                        >
                          <input
                            id={`task-repeat-weekday-${option.value}`}
                            type="checkbox"
                            checked={repeatWeekdays.includes(option.value)}
                            onChange={() => toggleWeekday(option.value)}
                            className="size-3.5 accent-current"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <Field
                  id="task-repeat-end"
                  label="Repeat ends"
                  hint="Optional. No end date repeats forever."
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
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
