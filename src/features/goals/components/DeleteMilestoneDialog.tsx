import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteMilestone } from "@/features/goals/hooks";
import type { Milestone } from "@/types/domain";

interface DeleteMilestoneDialogProps {
  open: boolean;
  onClose: () => void;
  milestone: Milestone | null;
}

export function DeleteMilestoneDialog({ open, onClose, milestone }: DeleteMilestoneDialogProps) {
  const deleteMilestone = useDeleteMilestone();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!milestone || deleteMilestone.isPending) {
      return;
    }
    setServerError(null);
    try {
      await deleteMilestone.mutateAsync({ id: milestone.id, goalId: milestone.goalId });
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not delete the milestone.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={milestone ? `Delete ${milestone.title}?` : "Delete milestone?"}
      description="This milestone will be permanently removed. This cannot be undone."
    >
      {serverError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={deleteMilestone.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => void handleConfirm()}
          loading={deleteMilestone.isPending}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
