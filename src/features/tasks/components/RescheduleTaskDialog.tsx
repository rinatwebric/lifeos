import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useRescheduleTask } from "@/features/tasks/hooks";
import type { Task } from "@/types/domain";

interface RescheduleTaskDialogProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}

export function RescheduleTaskDialog({ open, onClose, task }: RescheduleTaskDialogProps) {
  const rescheduleTask = useRescheduleTask();
  const [dueDate, setDueDate] = useState<string>("");
  const [serverError, setServerError] = useState<string | null>(null);

  // Re-sync on every open so the dialog always starts from the task's
  // current due date (empty = unscheduled): a render-phase adjustment, not
  // an effect, so no cascading render.
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const openKey = open ? (task?.id ?? "none") : null;
  if (openKey !== syncedKey) {
    setSyncedKey(openKey);
    setDueDate(task?.dueDate ?? "");
    setServerError(null);
  }

  const handleSave = async (): Promise<void> => {
    if (!task || rescheduleTask.isPending) {
      return;
    }
    setServerError(null);
    try {
      // An empty input clears the due date (`null`); past dates stay allowed —
      // overdue is derived via `isTaskOverdue`, never rejected.
      await rescheduleTask.mutateAsync({ id: task.id, dueDate: dueDate === "" ? null : dueDate });
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not reschedule the task.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? `Reschedule ${task.title}` : "Reschedule task"}
      description="Pick a new due date, or clear the input to leave the task unscheduled."
    >
      <div className="space-y-4">
        <Field id="task-reschedule-date" label="Due date" error={undefined}>
          <Input
            data-autofocus
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={rescheduleTask.isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={() => void handleSave()} loading={rescheduleTask.isPending}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
