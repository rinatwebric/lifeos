import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateGoal, useUpdateGoal } from "@/features/goals/hooks";
import {
  createGoalSchema,
  updateGoalSchema,
  type CreateGoalInput,
} from "@/features/goals/schema";
import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  PRIORITIES,
  type Goal,
} from "@/types/domain";
import { humanize } from "@/components/ui/Badge";

interface GoalFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `null` → create mode; a goal → edit mode. */
  goal: Goal | null;
}

type GoalFormValues = CreateGoalInput;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultValuesFor(goal: Goal | null): GoalFormValues {
  if (goal) {
    return {
      title: goal.title,
      description: goal.description,
      category: goal.category,
      priority: goal.priority,
      status: goal.status,
      startDate: goal.startDate,
      targetDate: goal.targetDate,
      progress: goal.progress,
      progressMode: goal.progressMode,
    };
  }

  return {
    title: "",
    description: null,
    category: "other",
    priority: "medium",
    status: "not_started",
    startDate: todayKey(),
    targetDate: null,
    progress: 0,
    progressMode: "manual",
  };
}

const nullIfEmpty = (value: unknown): string | null | unknown =>
  value === "" ? null : value;

export function GoalFormDialog({ open, onClose, goal }: GoalFormDialogProps) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(
      goal ? updateGoalSchema : createGoalSchema,
    ) as Resolver<GoalFormValues>,
    defaultValues: defaultValuesFor(goal),
  });

  const progressMode = watch("progressMode");
  const saving = createGoal.isPending || updateGoal.isPending;

  const onSubmit = async (values: GoalFormValues): Promise<void> => {
    setServerError(null);
    try {
      if (goal) {
        await updateGoal.mutateAsync({ id: goal.id, patch: values });
      } else {
        await createGoal.mutateAsync(values);
      }
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not save the goal.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? `Edit ${goal.title}` : "New goal"}
      description={
        goal
          ? "Update the goal details below."
          : "Define a long-term outcome. You can break it into milestones later."
      }
      wide
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="goal-title" label="Title" required error={errors.title?.message}>
          <Input placeholder="Learn to play the piano" {...register("title")} />
        </Field>

        <Field id="goal-description" label="Description" error={errors.description?.message}>
          <Textarea
            placeholder="Why does this goal matter?"
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="goal-category" label="Category" required error={errors.category?.message}>
            <Select {...register("category")}>
              {GOAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {humanize(category)}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="goal-priority" label="Priority" required error={errors.priority?.message}>
            <Select {...register("priority")}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {humanize(priority)}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="goal-status" label="Status" required error={errors.status?.message}>
            <Select {...register("status")}>
              {GOAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="goal-startDate" label="Start date" required error={errors.startDate?.message}>
            <Input type="date" {...register("startDate")} />
          </Field>

          <Field
            id="goal-targetDate"
            label="Target date"
            hint="Optional. Must be on or after the start date."
            error={errors.targetDate?.message}
          >
            <Input type="date" {...register("targetDate", { setValueAs: nullIfEmpty })} />
          </Field>
        </div>

        <div className="space-y-1.5 rounded-lg border border-line bg-surface-muted p-3">
          <div className="flex items-center gap-2">
            <input
              id="goal-progressMode"
              type="checkbox"
              className="size-4 accent-current"
              checked={progressMode === "milestones"}
              onChange={(event) =>
                setValue("progressMode", event.target.checked ? "milestones" : "manual", {
                  shouldValidate: true,
                })
              }
            />
            <label htmlFor="goal-progressMode" className="text-sm font-medium text-content">
              Calculate progress from milestones
            </label>
          </div>
          <p className="text-xs text-muted">
            When on, progress is derived from completed milestones. Your manual value is kept
            and shown again when the goal has no milestones yet.
          </p>
        </div>

        {progressMode === "manual" ? (
          <Field
            id="goal-progress"
            label="Progress (%)"
            hint="Manual estimate, 0 to 100."
            error={errors.progress?.message}
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              {...register("progress", { valueAsNumber: true })}
            />
          </Field>
        ) : null}

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
            {goal ? "Save changes" : "Create goal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
