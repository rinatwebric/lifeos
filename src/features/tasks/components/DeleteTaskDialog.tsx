import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteTask } from "@/features/tasks/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

interface DeleteTaskDialogProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}

export function DeleteTaskDialog({ open, onClose, task }: DeleteTaskDialogProps) {
  const m = useMessages();
  const t = m.tasks;
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
      setServerError(error instanceof Error ? error.message : t.deleteTaskError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? tmpl(t.deleteWithTitle, { title: task.title }) : t.deleteTitle}
      description={t.deleteDescription}
    >
      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteTask.isPending}>
          {t.cancel}
        </Button>
        <Button variant="danger" size="lg" onClick={() => void handleConfirm()} loading={deleteTask.isPending}>
          {t.delete}
        </Button>
      </div>
    </Dialog>
  );
}
