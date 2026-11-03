import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteGoal, useTaskCountForGoal } from "@/features/goals/hooks";
import type { Goal } from "@/types/domain";

interface DeleteGoalDialogProps {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}

function taskLine(count: number): string {
  if (count === 1) {
    return "1 task will stay but lose the link to this goal. This cannot be undone.";
  }
  return `${count} tasks will stay but lose the link to this goal. This cannot be undone.`;
}

export function DeleteGoalDialog({ open, onClose, goal }: DeleteGoalDialogProps) {
  const taskCount = useTaskCountForGoal(open ? goal?.id : undefined);
  const deleteGoal = useDeleteGoal();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!goal || deleteGoal.isPending) {
      return;
    }
    setServerError(null);
    try {
      await deleteGoal.mutateAsync(goal.id);
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not delete the goal.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? `Delete ${goal.title}?` : "Delete goal?"}
      description="Linked tasks keep their rows and lose the link (SET NULL); milestones are removed with the goal. No task is ever cascade-deleted."
    >
      {taskCount.isLoading ? (
        <p className="text-sm text-muted">Counting linked tasks…</p>
      ) : taskCount.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not count linked tasks.{" "}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => void taskCount.refetch()}
          >
            Retry
          </button>
        </p>
      ) : (
        <p className="text-sm text-content">{taskLine(taskCount.data ?? 0)}</p>
      )}

      {serverError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={deleteGoal.isPending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void handleConfirm()} loading={deleteGoal.isPending}>
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
