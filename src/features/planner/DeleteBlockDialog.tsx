import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

import { describeBlockError } from "./blockMessages";
import { useDeleteBlock } from "./hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";

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

export function DeleteBlockDialog({ open, onClose, block }: DeleteBlockDialogProps) {
  const m = useMessages();
  const t = m.planner;
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
      setServerError(describeBlockError(error, t));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={block ? tmpl(t.deleteBlockWithTitle, { title: block.title }) : t.deleteBlockTitle}
      description={block?.taskId ? t.deleteBlockTaskHint : t.deleteBlockHint}
    >
      {serverError ? (
        <p role="alert" className="text-ui text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteBlock.isPending}>
          {t.cancel}
        </Button>
        <Button
          variant="danger"
          size="lg"
          loading={deleteBlock.isPending}
          onClick={() => void handleConfirm()}
        >
          {t.deleteBlock}
        </Button>
      </div>
    </Dialog>
  );
}
