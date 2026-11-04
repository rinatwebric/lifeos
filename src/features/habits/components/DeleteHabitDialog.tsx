import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteHabit } from "@/features/habits/hooks";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Habit } from "@/types/domain";

interface DeleteHabitDialogProps {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  /** Logged days that disappear with the habit (logs cascade). */
  loggedDays: number;
}

export function DeleteHabitDialog({ open, onClose, habit, loggedDays }: DeleteHabitDialogProps) {
  const locale = useLocale();
  const m = useMessages();
  const t = m.habits.remove;
  const deleteHabit = useDeleteHabit();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!habit || deleteHabit.isPending) {
      return;
    }
    setServerError(null);
    try {
      await deleteHabit.mutateAsync(habit.id);
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.loadError);
    }
  };

  const description =
    loggedDays === 0
      ? t.description
      : tmpl(
          pluralCategory(locale, loggedDays) === "one"
            ? t.descriptionWithLogsOne
            : pluralCategory(locale, loggedDays) === "few"
              ? t.descriptionWithLogsFew
              : t.descriptionWithLogsMany,
          { count: loggedDays },
        );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={habit ? tmpl(t.titleWithName, { title: habit.title }) : t.titleGeneric}
      description={description}
    >
      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteHabit.isPending}>
          {t.cancel}
        </Button>
        <Button variant="danger" size="lg" onClick={() => void handleConfirm()} loading={deleteHabit.isPending}>
          {t.deleteAction}
        </Button>
      </div>
    </Dialog>
  );
}
