import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateHabit, useUpdateHabit } from "@/features/habits/hooks";
import {
  MAX_SQL_INTEGER,
  createHabitFormSchemas,
  type CreateHabitInput,
} from "@/features/habits/schemas";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useRevalidateOnLocaleChange } from "@/lib/i18n/useRevalidate";
import { HABIT_STATUSES, type Habit, type RecurrenceFrequency } from "@/types/domain";

interface HabitFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `null` → create mode; a habit → edit mode. */
  habit: Habit | null;
}

type HabitFormValues = CreateHabitInput;

const FREQUENCY_VALUES: RecurrenceFrequency[] = ["daily", "weekdays", "weekly"];

const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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

export function HabitFormDialog({ open, onClose, habit }: HabitFormDialogProps) {
  const m = useMessages();
  const t = m.habits.form;
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const [serverError, setServerError] = useState<string | null>(null);

  const schemas = useMemo(
    () =>
      createHabitFormSchemas({
        titleRequired: m.validation.titleRequired,
        titleTooLong: m.validation.titleTooLong,
        descriptionTooLong: m.validation.descriptionTooLong,
        dateFormat: m.validation.dateFormat,
        timeFormat: m.validation.timeFormat,
        weekdayRequired: m.validation.weekdayRequired,
        targetCountMin: m.validation.targetCountMin,
        targetCountMax: tmpl(m.validation.targetCountMax, { max: MAX_SQL_INTEGER }),
        validHabit: m.validation.validHabit,
        completedCountMin: m.validation.completedCountMin,
        completedCountMax: tmpl(m.validation.completedCountMax, { max: MAX_SQL_INTEGER }),
        noteTooLong: m.validation.noteTooLong,
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
  } = useForm<HabitFormValues>({
    resolver: zodResolver(
      habit ? (schemas.updateHabitSchema as never) : (schemas.createHabitSchema as never),
    ) as Resolver<HabitFormValues>,
    defaultValues: defaultValuesFor(habit),
  });

  useRevalidateOnLocaleChange(trigger, Object.keys(errors).length > 0);

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

  const frequencyLabel = (value: RecurrenceFrequency): string =>
    value === "daily" ? t.frequencyDaily : value === "weekly" ? t.frequencyWeekly : t.frequencyWeekdays;

  const weekdayLabel = (value: number): string =>
    m.enums.weekdayShort[WEEKDAY_KEYS[value] ?? "mon"];

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
      setServerError(error instanceof Error ? error.message : t.loadError);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={habit ? t.editTitle : t.createTitle}
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-4"
        noValidate
      >
        <Field id="habit-title" label={t.fieldTitle} error={errors.title?.message} required>
          <Input
            {...register("title")}
            data-autofocus
            placeholder={t.titlePlaceholder}
            aria-invalid={Boolean(errors.title)}
          />
        </Field>

        <Field id="habit-description" label={t.fieldDescription} error={errors.description?.message}>
          <Textarea
            {...register("description")}
            placeholder={t.descriptionPlaceholder}
            rows={2}
          />
        </Field>

        <Field id="habit-frequency" label={t.fieldFrequency} error={errors.frequency?.message} hint={t.frequencyHelp}>
          <Select {...register("frequency")} aria-invalid={Boolean(errors.frequency)}>
            {FREQUENCY_VALUES.map((value) => (
              <option key={value} value={value}>
                {frequencyLabel(value)}
              </option>
            ))}
          </Select>
        </Field>

        {frequency === "weekdays" ? (
          <fieldset>
            <legend className="text-ui font-medium text-content">{t.daysLegend}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_VALUES.map((value) => {
                const checked = weekdays.includes(value);
                return (
                  <label
                    key={value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-card border border-line px-3 py-2 text-ui text-content"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeekday(value)}
                      aria-label={weekdayLabel(value)}
                      className="size-4 shrink-0 accent-current"
                    />
                    {weekdayLabel(value)}
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
          <Field id="habit-target" label={t.fieldTarget} error={errors.targetCount?.message}>
            <Input
              type="number"
              min={1}
              step={1}
              {...register("targetCount", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.targetCount)}
            />
          </Field>

          <Field id="habit-start" label={t.fieldStart} error={errors.startDate?.message}>
            <Input
              type="date"
              {...register("startDate")}
              aria-invalid={Boolean(errors.startDate)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="habit-reminder" label={t.fieldReminder} error={errors.reminderTime?.message} hint={t.reminderHelp}>
            <Input
              type="time"
              {...register("reminderTime")}
              aria-invalid={Boolean(errors.reminderTime)}
            />
          </Field>

          <Field id="habit-status" label={t.fieldStatus} error={errors.status?.message}>
            <Select {...register("status")} aria-invalid={Boolean(errors.status)}>
              {HABIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {m.enums.status[status]}
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
            {t.cancel}
          </Button>
          <Button size="lg" loading={saving} type="submit">
            {habit ? t.saveAction : t.createAction}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
