import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteTask } from "@/features/tasks/hooks";
import type { Task } from "@/types/domain";

interface DeleteTaskDialogProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}

export function DeleteTaskDialog({ open, onClose, task }: DeleteTaskDialogProps) {
  const deleteTask = useDeleteTask();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!task || deleteTask.isPending) {
      return;
    }
    setServerError(null);
    try {
      // The goal travels with the call: the cached detail may be gone, but
      // the goal's task-count still refreshes.
      await deleteTask.mutateAsync({ id: task.id, goalId: task.goalId });
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not delete the task.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? `Delete ${task.title}?` : "Delete task?"}
      description="This cannot be undone."
    >
      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteTask.isPending}>
          Cancel
        </Button>
        <Button variant="danger" size="lg" onClick={() => void handleConfirm()} loading={deleteTask.isPending}>
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
