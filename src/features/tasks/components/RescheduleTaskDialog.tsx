import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { useRescheduleTask } from "@/features/tasks/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

interface RescheduleTaskDialogProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}

export function RescheduleTaskDialog({ open, onClose, task }: RescheduleTaskDialogProps) {
  const m = useMessages();
  const t = m.tasks;
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
      setServerError(error instanceof Error ? error.message : t.rescheduleError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? tmpl(t.rescheduleWithTitle, { title: task.title }) : t.rescheduleTitle}
      description={t.rescheduleDescription}
    >
      <div className="space-y-4">
        <Field id="task-reschedule-date" label={t.rescheduleDueDate} error={undefined}>
          <DateTimePicker
            mode="date"
            data-autofocus
            clearable
            className="[&>button]:min-h-11 sm:[&>button]:min-h-10"
            value={dueDate}
            onChange={setDueDate}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            onClick={onClose}
            disabled={rescheduleTask.isPending}
          >
            {t.cancel}
          </Button>
          <Button
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => void handleSave()}
            loading={rescheduleTask.isPending}
          >
            {t.rescheduleSave}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
