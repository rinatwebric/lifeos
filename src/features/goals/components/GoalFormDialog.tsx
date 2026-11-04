import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateGoal, useUpdateGoal } from "@/features/goals/hooks";
import {
  createGoalFormSchemas,
  type CreateGoalInput,
} from "@/features/goals/schema";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useRevalidateOnLocaleChange } from "@/lib/i18n/useRevalidate";
import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  PRIORITIES,
  type Goal,
} from "@/types/domain";

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
  const m = useMessages();
  const t = m.goals;
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const [serverError, setServerError] = useState<string | null>(null);

  const schemas = useMemo(
    () =>
      createGoalFormSchemas({
        titleRequired: m.validation.titleRequired,
        titleTooLong: m.validation.titleTooLong,
        descriptionTooLong: m.validation.descriptionTooLong,
        dateFormat: m.validation.dateFormat,
        progressRange: m.validation.progressRange,
        targetAfterStart: m.validation.targetAfterStart,
        goalRequired: m.validation.goalRequired,
      }),
    [m.validation],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(
      goal ? (schemas.updateGoalSchema as never) : (schemas.createGoalSchema as never),
    ) as Resolver<GoalFormValues>,
    defaultValues: defaultValuesFor(goal),
  });

  useRevalidateOnLocaleChange(trigger, Object.keys(errors).length > 0);

  // RHF reads `defaultValues` only on first mount, but this dialog stays
  // mounted while `goal`/`open` change. Re-sync on every open so Edit shows
  // the selected goal and a fresh create never reuses the previous values.
  useEffect(() => {
    if (open) {
      reset(defaultValuesFor(goal));
      setServerError(null);
    }
  }, [open, goal, reset]);

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
      setServerError(error instanceof Error ? error.message : t.saveGoalError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? tmpl(t.formEditTitle, { title: goal.title }) : t.formNewTitle}
      description={goal ? t.formEditDescription : t.formNewDescription}
      wide
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="goal-title" label={t.fieldTitle} required error={errors.title?.message}>
          <Input data-autofocus placeholder={t.titlePlaceholder} {...register("title")} />
        </Field>

        <Field id="goal-description" label={t.fieldDescription} error={errors.description?.message}>
          <Textarea
            placeholder={t.descriptionPlaceholder}
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="goal-category" label={t.fieldCategory} required error={errors.category?.message}>
            <Select {...register("category")}>
              {GOAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {m.enums.category[category]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="goal-priority" label={t.fieldPriority} required error={errors.priority?.message}>
            <Select {...register("priority")}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {m.enums.priority[priority]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="goal-status" label={t.fieldStatus} required error={errors.status?.message}>
            <Select {...register("status")}>
              {GOAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {m.enums.status[status]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="goal-startDate" label={t.fieldStartDate} required error={errors.startDate?.message}>
            <Input type="date" {...register("startDate")} />
          </Field>

          <Field
            id="goal-targetDate"
            label={t.fieldTargetDate}
            hint={t.targetHint}
            error={errors.targetDate?.message}
          >
            <Input type="date" {...register("targetDate", { setValueAs: nullIfEmpty })} />
          </Field>
        </div>

        <div className="space-y-1.5 rounded-card border border-line bg-surface-muted p-3">
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
            <label htmlFor="goal-progressMode" className="text-ui font-medium text-content">
              {t.progressFromMilestones}
            </label>
          </div>
          <p className="text-micro text-muted">
            {t.progressFromMilestonesHint}
          </p>
        </div>

        {progressMode === "manual" ? (
          <Field
            id="goal-progress"
            label={t.fieldProgress}
            hint={t.progressHint}
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
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {goal ? t.saveChanges : t.createGoal}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
