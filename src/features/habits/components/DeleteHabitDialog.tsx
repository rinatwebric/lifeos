import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteHabit } from "@/features/habits/hooks";
import type { Habit } from "@/types/domain";

interface DeleteHabitDialogProps {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  /** Logged days that disappear with the habit (logs cascade). */
  loggedDays: number;
}

export function DeleteHabitDialog({ open, onClose, habit, loggedDays }: DeleteHabitDialogProps) {
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
      setServerError(error instanceof Error ? error.message : "Could not delete the habit.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={habit ? `Delete ${habit.title}?` : "Delete habit?"}
      description={
        loggedDays === 0
          ? "The habit and its schedule history will be removed. This cannot be undone."
          : `${loggedDays} ${loggedDays === 1 ? "logged day" : "logged days"} will be deleted too. This cannot be undone.`
      }
    >
      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteHabit.isPending}>
          Cancel
        </Button>
        <Button variant="danger" size="lg" onClick={() => void handleConfirm()} loading={deleteHabit.isPending}>
          Delete habit
        </Button>
      </div>
    </Dialog>
  );
}
