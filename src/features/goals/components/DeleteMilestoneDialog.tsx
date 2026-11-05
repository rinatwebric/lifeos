import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDeleteMilestone } from "@/features/goals/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Milestone } from "@/types/domain";

interface DeleteMilestoneDialogProps {
  open: boolean;
  onClose: () => void;
  milestone: Milestone | null;
}

export function DeleteMilestoneDialog({ open, onClose, milestone }: DeleteMilestoneDialogProps) {
  const m = useMessages();
  const t = m.goals;
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
      setServerError(error instanceof Error ? error.message : t.deleteMilestoneError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={milestone ? tmpl(t.deleteMilestoneWithTitle, { title: milestone.title }) : t.deleteMilestoneTitle}
      description={t.deleteMilestoneDescription}
    >
      {serverError ? (
        <p role="alert" className="text-micro text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" data-autofocus onClick={onClose} disabled={deleteMilestone.isPending}>
          {t.cancel}
        </Button>
        <Button
          variant="danger"
          size="lg"
          onClick={() => void handleConfirm()}
          loading={deleteMilestone.isPending}
        >
          {t.delete}
        </Button>
      </div>
    </Dialog>
  );
}
