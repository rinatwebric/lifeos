import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/CheckCircle";
import { Input } from "@/components/ui/Input";
import { DeleteMilestoneDialog } from "@/features/goals/components/DeleteMilestoneDialog";
import { MilestoneFormDialog } from "@/features/goals/components/MilestoneFormDialog";
import {
  useCreateMilestone,
  useDeleteMilestone,
  useReorderMilestones,
  useUpdateMilestone,
} from "@/features/goals/hooks";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Milestone } from "@/types/domain";

interface MilestoneListProps {
  goalId: string;
  milestones: Milestone[];
}

const ROW_ACTION_CLASS = "relative after:absolute after:-inset-1 after:content-['']";

function orderedIdsAfterMove(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
}

export function MilestoneList({ goalId, milestones }: MilestoneListProps) {
  const m = useMessages();
  const t = m.goals;
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const reorderMilestones = useReorderMilestones();

  const [editing, setEditing] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.position - b.position),
    [milestones],
  );

  const handleToggle = (milestone: Milestone): void => {
    const nextStatus = milestone.status === "completed" ? "pending" : "completed";
    updateMilestone.mutate({ id: milestone.id, goalId, patch: { status: nextStatus } });
  };

  const handleMove = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length || reorderMilestones.isPending) {
      return;
    }
    const ids = sorted.map((milestone) => milestone.id);
    reorderMilestones.mutate({ goalId, orderedIds: orderedIdsAfterMove(ids, index, target) });
  };

  const handleAdd = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault();
    const title = newTitle.trim();
    if (!title || createMilestone.isPending) {
      return;
    }
    setAddError(null);
    try {
      await createMilestone.mutateAsync({ goalId, title });
      setNewTitle("");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : t.milestoneAddError);
    }
  };

  const addErrorText = addError ?? (createMilestone.isError ? t.milestoneAddError : null);
  const composer = (
    <form
      onSubmit={(event) => void handleAdd(event)}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 sm:flex-row sm:p-4"
    >
      <Input
        aria-label={t.addMilestoneAria}
        placeholder={t.addMilestonePlaceholder}
        className="min-h-11 sm:min-h-10"
        value={newTitle}
        onChange={(event) => {
          setNewTitle(event.target.value);
          setAddError(null);
        }}
      />
      <Button
        type="submit"
        loading={createMilestone.isPending}
        className="min-h-11 shrink-0 sm:min-h-0"
      >
        <Plus className="size-4" aria-hidden="true" />
        {t.addMilestone}
      </Button>
    </form>
  );

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
          <p className="mx-auto max-w-sm text-ui text-muted text-pretty">{t.milestoneEmpty}</p>
        </div>
        {composer}
        {addErrorText ? (
          <p role="alert" className="text-micro text-danger">
            {addErrorText}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {updateMilestone.isError ? (
        <p role="alert" className="text-micro text-danger">
          {t.milestoneUpdateError}
        </p>
      ) : null}
      {reorderMilestones.isError ? (
        <p role="alert" className="text-micro text-danger">
          {t.milestoneReorderError}
        </p>
      ) : null}
      {deleteMilestone.isError ? (
        <p role="alert" className="text-micro text-danger">
          {t.milestoneDeleteError}
        </p>
      ) : null}

      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {sorted.map((milestone, index) => {
          const completed = milestone.status === "completed";
          return (
            <li
              key={milestone.id}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5"
            >
              <div className="flex min-w-[12rem] flex-1 items-start gap-3">
                <CheckCircle
                  id={`milestone-${milestone.id}`}
                  checked={completed}
                  onChange={() => handleToggle(milestone)}
                  ariaLabel={
                    completed
                      ? tmpl(t.markMilestonePending, { title: milestone.title })
                      : tmpl(t.markMilestoneComplete, { title: milestone.title })
                  }
                  className="mt-0.5 size-11 cursor-pointer"
                />
                <div className="min-w-0 flex-1 pt-2.5">
                  <p
                    title={milestone.title}
                    className={
                      completed
                        ? "truncate text-ui text-muted line-through"
                        : "truncate text-ui text-content"
                    }
                  >
                    {milestone.title}
                  </p>
                  {milestone.targetDate ? (
                    <p className="mt-0.5 text-micro text-muted tabular-nums">
                      {milestone.targetDate}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-11 sm:justify-end sm:pl-0">
                <Button
                  variant="ghost"
                  size="md"
                  className={ROW_ACTION_CLASS}
                  aria-label={tmpl(t.moveUp, { title: milestone.title })}
                  disabled={index === 0 || reorderMilestones.isPending}
                  onClick={() => handleMove(index, -1)}
                >
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className={ROW_ACTION_CLASS}
                  aria-label={tmpl(t.moveDown, { title: milestone.title })}
                  disabled={index === sorted.length - 1 || reorderMilestones.isPending}
                  onClick={() => handleMove(index, 1)}
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className={ROW_ACTION_CLASS}
                  onClick={() => setEditing(milestone)}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  {m.common.edit}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className={ROW_ACTION_CLASS}
                  onClick={() => setDeleting(milestone)}
                  aria-label={tmpl(t.deleteAria, { title: milestone.title })}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t.delete}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {composer}
      {addErrorText ? (
        <p role="alert" className="text-micro text-danger">
          {addErrorText}
        </p>
      ) : null}

      <MilestoneFormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        goalId={goalId}
        milestone={editing}
      />
      <DeleteMilestoneDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        milestone={deleting}
      />
    </div>
  );
}
