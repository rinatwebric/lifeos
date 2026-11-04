import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

import { describeBlockError } from "./blockMessages";
import { useDeleteBlock } from "./hooks";

/**
 * Delete confirmation for one time block (plan.md Unit 7).
 *
 * The mirror rule is not re-implemented here: `deleteBlock` from `../api`
 * already clears `scheduled_start` / `scheduled_end` on the linked task (or
 * repoints them at the task's earliest surviving block) inside the same
 * service call, so the confirmation only has to say what will happen and
 * hand over the block.
 */
export interface DeleteBlockTarget {
  id: string;
  title: string;
  taskId: string | null;
}

export interface DeleteBlockDialogProps {
  open: boolean;
  onClose: () => void;
  block: DeleteBlockTarget | null;
}

function describeConsequence(taskId: string | null): string {
  return taskId === null
    ? "The block leaves your plan and the time becomes free again. This cannot be undone."
    : "The block leaves your plan and the task stops showing a scheduled time. The task itself stays. This cannot be undone.";
}

export function DeleteBlockDialog({ open, onClose, block }: DeleteBlockDialogProps) {
  const deleteBlock = useDeleteBlock();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!block || deleteBlock.isPending) {
      return;
    }

    setServerError(null);

    try {
      await deleteBlock.mutateAsync({ id: block.id, taskId: block.taskId });
      onClose();
    } catch (error) {
      setServerError(describeBlockError(error));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={block ? `Delete “${block.title}”?` : "Delete block?"}
      description={describeConsequence(block?.taskId ?? null)}
    >
      {serverError ? (
        <p role="alert" className="text-ui text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteBlock.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="lg"
          loading={deleteBlock.isPending}
          onClick={() => void handleConfirm()}
        >
          Delete block
        </Button>
      </div>
    </Dialog>
  );
}