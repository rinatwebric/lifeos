import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useLogHabit } from "@/features/habits/hooks";
import { MAX_SQL_INTEGER } from "@/features/habits/schemas";
import type { Habit } from "@/types/domain";

interface LogHabitDialogProps {
  open: boolean;
  onClose: () => void;
  /** The habit receiving the log; `null` keeps the dialog unmounted. */
  habit: Habit | null;
  /** Today in the profile timezone — the default log date. */
  todayKey: string;
}

const logFormSchema = z.object({
  logDate: z.iso.date({ error: "Use YYYY-MM-DD." }),
  completedCount: z
    .number()
    .int()
    .min(0, "Completed count must be 0 or more.")
    .max(MAX_SQL_INTEGER, `Completed count must be at most ${MAX_SQL_INTEGER}.`),
  note: z.string().trim().max(2000, "Note must be 2,000 characters or fewer.").nullable().optional(),
});

type LogFormValues = z.infer<typeof logFormSchema>;

const LOG_HABIT_COPY = {
  overTargetHint: "Above target counts too — overfulfilment is kept.",
  logAction: "Save log",
  loadError: "Could not save the log. Please try again.",
} as const;

export function LogHabitDialog({ open, onClose, habit, todayKey }: LogHabitDialogProps) {
  const logHabit = useLogHabit();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(logFormSchema) as Resolver<LogFormValues>,
    defaultValues: { logDate: todayKey, completedCount: 1, note: null },
  });

  useEffect(() => {
    if (open) {
      reset({ logDate: todayKey, completedCount: habit?.targetCount ?? 1, note: null });
      setServerError(null);
    }
  }, [open, habit, todayKey, reset]);

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
      setServerError(error instanceof Error ? error.message : LOG_HABIT_COPY.loadError);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={habit ? `Log ${habit.title}` : "Log habit"}
      description={
        habit
          ? `Target ${habit.targetCount}${habit.frequency === "weekly" ? " for the week" : " for the day"}.`
          : undefined
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field id="habit-log-date" label="Date" error={errors.logDate?.message}>
            <Input
              type="date"
              {...register("logDate")}
              data-autofocus
              aria-invalid={Boolean(errors.logDate)}
            />
          </Field>

          <Field id="habit-log-count" label="Completed count" error={errors.completedCount?.message} hint={LOG_HABIT_COPY.overTargetHint}>
            <Input
              type="number"
              min={0}
              step={1}
              {...register("completedCount", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.completedCount)}
            />
          </Field>
        </div>

        <Field id="habit-log-note" label="Note" error={errors.note?.message}>
          <Textarea {...register("note")} placeholder="How did it go?" rows={2} />
        </Field>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={logHabit.isPending} type="button">
            Cancel
          </Button>
          <Button size="lg" loading={logHabit.isPending} type="submit">
            {LOG_HABIT_COPY.logAction}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
