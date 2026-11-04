import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateHabit, useUpdateHabit } from "@/features/habits/hooks";
import { createHabitSchema, updateHabitSchema } from "@/features/habits/schemas";
import { HABIT_STATUSES, type Habit, type RecurrenceFrequency } from "@/types/domain";

interface HabitFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `null` → create mode; a habit → edit mode. */
  habit: Habit | null;
}

type HabitFormValues = {
  title: string;
  description: string | null;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  targetCount: number;
  reminderTime?: string | null;
  startDate: string;
  status: Habit["status"];
};

const FREQUENCY_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Specific weekdays" },
  { value: "weekly", label: "Weekly target" },
];

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function defaultValuesFor(habit: Habit | null): HabitFormValues {
  if (habit) {
    return {
      title: habit.title,
      description: habit.description,
      frequency: habit.frequency,
      weekdays: [...habit.weekdays],
      targetCount: habit.targetCount,
      reminderTime: habit.reminderTime ? habit.reminderTime.slice(0, 5) : null,
      startDate: habit.startDate,
      status: habit.status,
    };
  }

  return {
    title: "",
    description: null,
    frequency: "daily",
    weekdays: [],
    targetCount: 1,
    reminderTime: null,
    startDate: new Date().toISOString().slice(0, 10),
    status: "active",
  };
}

const HABIT_FORM_COPY = {
  createTitle: "New habit",
  editTitle: "Edit habit",
  frequencyHelp: "Daily counts each day; weekdays count the selected days; weekly sums the whole week, Monday to Sunday.",
  reminderHelp: "Stored only — reminders are not sent yet.",
  createAction: "Create habit",
  saveAction: "Save changes",
  loadError: "Could not save the habit. Please try again.",
} as const;

export function HabitFormDialog({ open, onClose, habit }: HabitFormDialogProps) {
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<HabitFormValues>({
    resolver: zodResolver(habit ? updateHabitSchema : createHabitSchema) as Resolver<HabitFormValues>,
    defaultValues: defaultValuesFor(habit),
  });

  // RHF reads `defaultValues` only on first mount, but this dialog stays
  // mounted while `habit`/`open` change. Re-sync on every open so Edit shows
  // the selected habit and a fresh create never reuses previous values.
  // (Server errors clear on close/submit, never inside this effect.)
  useEffect(() => {
    if (open) {
      reset(defaultValuesFor(habit));
    }
  }, [open, habit, reset]);

  const handleClose = (): void => {
    setServerError(null);
    onClose();
  };

  const frequency = watch("frequency");
  const weekdays = watch("weekdays") ?? [];
  const saving = createHabit.isPending || updateHabit.isPending;

  const toggleWeekday = (day: number): void => {
    const next = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day].sort((a, b) => a - b);
    setValue("weekdays", next, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // Empty inputs submit as "": normalize to null so optional fields stay
    // null (an empty reminder time would otherwise fail the HH:MM shape).
    const normalized = {
      ...values,
      description: values.description === "" ? null : values.description,
      reminderTime: values.reminderTime === "" ? null : (values.reminderTime ?? null),
    };
    try {
      if (habit) {
        await updateHabit.mutateAsync({ id: habit.id, patch: normalized });
      } else {
        await createHabit.mutateAsync(normalized);
      }
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : HABIT_FORM_COPY.loadError);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={habit ? HABIT_FORM_COPY.editTitle : HABIT_FORM_COPY.createTitle}
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-4"
        noValidate
      >
        <Field id="habit-title" label="Title" error={errors.title?.message} required>
          <Input
            {...register("title")}
            data-autofocus
            placeholder="Read 20 minutes"
            aria-invalid={Boolean(errors.title)}
          />
        </Field>

        <Field id="habit-description" label="Description" error={errors.description?.message}>
          <Textarea
            {...register("description")}
            placeholder="Why this habit matters"
            rows={2}
          />
        </Field>

        <Field id="habit-frequency" label="Frequency" error={errors.frequency?.message} hint={HABIT_FORM_COPY.frequencyHelp}>
          <Select {...register("frequency")} aria-invalid={Boolean(errors.frequency)}>
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {frequency === "weekdays" ? (
          <fieldset>
            <legend className="text-ui font-medium text-content">Days</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((option) => {
                const checked = weekdays.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-card border border-line px-3 py-2 text-ui text-content"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeekday(option.value)}
                      aria-label={option.label}
                      className="size-4 shrink-0 accent-current"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
            {errors.weekdays?.message ? (
              <p role="alert" className="text-micro text-danger mt-1">
                {errors.weekdays.message}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field id="habit-target" label="Target count" error={errors.targetCount?.message}>
            <Input
              type="number"
              min={1}
              step={1}
              {...register("targetCount", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.targetCount)}
            />
          </Field>

          <Field id="habit-start" label="Start date" error={errors.startDate?.message}>
            <Input
              type="date"
              {...register("startDate")}
              aria-invalid={Boolean(errors.startDate)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="habit-reminder" label="Reminder time" error={errors.reminderTime?.message} hint={HABIT_FORM_COPY.reminderHelp}>
            <Input
              type="time"
              {...register("reminderTime")}
              aria-invalid={Boolean(errors.reminderTime)}
            />
          </Field>

          <Field id="habit-status" label="Status" error={errors.status?.message}>
            <Select {...register("status")} aria-invalid={Boolean(errors.status)}>
              {HABIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === "active" ? "Active" : status === "paused" ? "Paused" : "Archived"}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={saving} type="button">
            Cancel
          </Button>
          <Button size="lg" loading={saving} type="submit">
            {habit ? HABIT_FORM_COPY.saveAction : HABIT_FORM_COPY.createAction}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
