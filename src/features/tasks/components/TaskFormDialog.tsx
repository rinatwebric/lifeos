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
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
} from "@/features/tasks/schema";
import { isoToLocalDateTime, localDateTimeToIso } from "@/lib/dates";
import { humanize } from "@/lib/strings";
import { PRIORITIES, TASK_STATUSES, type Task } from "@/types/domain";

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `null` → create mode; a task → edit mode. */
  task: Task | null;
  /** Profile time zone: datetime-local inputs convert only through it. */
  timeZone: string;
}

type TaskFormValues = CreateTaskInput;

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
  const updateTask = useUpdateTask();
  const goalsQuery = useGoals();
  const [serverError, setServerError] = useState<string | null>(null);

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
    }
  }, [open, task, reset]);

  const selectedGoalId = watch("goalId") ?? null;
  const selectedMilestoneId = watch("milestoneId") ?? null;
  const scheduledStart = watch("scheduledStart") ?? null;
  const scheduledEnd = watch("scheduledEnd") ?? null;
  const milestonesQuery = useMilestones(selectedGoalId ?? undefined);

  const saving = createTask.isPending || updateTask.isPending;

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

  const onSubmit = async (values: TaskFormValues): Promise<void> => {
    setServerError(null);
    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, patch: values });
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
          <Input placeholder="Write the report" {...register("title")} />
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

        {serverError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
