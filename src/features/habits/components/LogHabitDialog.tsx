import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useLogHabit } from "@/features/habits/hooks";
import {
  MAX_SQL_INTEGER,
  createHabitLogFormSchemas,
} from "@/features/habits/schemas";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useRevalidateOnLocaleChange } from "@/lib/i18n/useRevalidate";
import type { Habit } from "@/types/domain";

interface LogHabitDialogProps {
  open: boolean;
  onClose: () => void;
  /** The habit receiving the log; `null` keeps the dialog unmounted. */
  habit: Habit | null;
  /** Today in the profile timezone — the default log date. */
  todayKey: string;
}

type LogFormValues = {
  logDate: string;
  completedCount: number;
  note: string | null | undefined;
};

export function LogHabitDialog({ open, onClose, habit, todayKey }: LogHabitDialogProps) {
  const m = useMessages();
  const t = m.habits.log;
  const logHabit = useLogHabit();
  const [serverError, setServerError] = useState<string | null>(null);

  const schemas = useMemo(
    () =>
      createHabitLogFormSchemas({
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
    reset,
    trigger,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(schemas.createHabitLogSchema.omit({ habitId: true }) as never) as Resolver<LogFormValues>,
    defaultValues: { logDate: todayKey, completedCount: 1, note: null },
  });

  useRevalidateOnLocaleChange(trigger, Object.keys(errors).length > 0);

  useEffect(() => {
    if (open) {
      reset({ logDate: todayKey, completedCount: habit?.targetCount ?? 1, note: null });
    }
  }, [open, habit, todayKey, reset]);

  const handleClose = (): void => {
    setServerError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!habit || logHabit.isPending) {
      return;
    }
    setServerError(null);
    try {
      await logHabit.mutateAsync({
        habitId: habit.id,
        logDate: values.logDate,
        completedCount: values.completedCount,
        note: values.note?.trim() ? values.note : null,
      });
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.loadError);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={habit ? tmpl(t.titleWithName, { title: habit.title }) : t.titleGeneric}
      description={
        habit
          ? tmpl(habit.frequency === "weekly" ? t.targetWeek : t.targetDay, {
              count: habit.targetCount,
            })
          : undefined
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field id="habit-log-date" label={t.fieldDate} error={errors.logDate?.message}>
            <Input
              type="date"
              {...register("logDate")}
              data-autofocus
              aria-invalid={Boolean(errors.logDate)}
            />
          </Field>

          <Field id="habit-log-count" label={t.fieldCount} error={errors.completedCount?.message} hint={t.overTargetHint}>
            <Input
              type="number"
              min={0}
              step={1}
              {...register("completedCount", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.completedCount)}
            />
          </Field>
        </div>

        <Field id="habit-log-note" label={t.fieldNote} error={errors.note?.message}>
          <Textarea {...register("note")} placeholder={t.notePlaceholder} rows={2} />
        </Field>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={logHabit.isPending} type="button">
            {t.cancel}
          </Button>
          <Button size="lg" loading={logHabit.isPending} type="submit">
            {t.logAction}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
