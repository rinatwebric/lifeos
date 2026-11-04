import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteGoal, useTaskCountForGoal } from "@/features/goals/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Goal } from "@/types/domain";

interface DeleteGoalDialogProps {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
  /** Called after a successful delete so callers can leave the detail page. */
  onDeleted?: () => void;
}

export function DeleteGoalDialog({ open, onClose, goal, onDeleted }: DeleteGoalDialogProps) {
  const m = useMessages();
  const t = m.goals;
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
      onDeleted?.();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.deleteGoalError);
    }
  };

  const count = taskCount.data ?? 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? tmpl(t.deleteTitle, { title: goal.title }) : t.deleteGoalTitle}
      description={t.deleteDescription}
    >
      {taskCount.isLoading ? (
        <p className="text-ui text-muted">{t.countingTasks}</p>
      ) : taskCount.isError ? (
        <p role="alert" className="text-micro text-danger">
          {t.countTasksError}{" "}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => void taskCount.refetch()}
          >
            {m.common.retry}
          </button>
        </p>
      ) : (
        <p className="text-ui text-content tabular-nums">
          {count === 1 ? t.tasksStayOne : tmpl(t.tasksStayMany, { count })}
        </p>
      )}

      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteGoal.isPending}>
          {t.cancel}
        </Button>
        <Button variant="danger" size="lg" onClick={() => void handleConfirm()} loading={deleteGoal.isPending}>
          {t.delete}
        </Button>
      </div>
    </Dialog>
  );
}
