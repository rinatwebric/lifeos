import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DeleteMilestoneDialog } from "@/features/goals/components/DeleteMilestoneDialog";
import { MilestoneFormDialog } from "@/features/goals/components/MilestoneFormDialog";
import {
  useCreateMilestone,
  useDeleteMilestone,
  useReorderMilestones,
  useUpdateMilestone,
} from "@/features/goals/hooks";
import type { Milestone } from "@/types/domain";

interface MilestoneListProps {
  goalId: string;
  milestones: Milestone[];
}

function orderedIdsAfterMove(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
}

export function MilestoneList({ goalId, milestones }: MilestoneListProps) {
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
      setAddError(error instanceof Error ? error.message : "Could not add the milestone.");
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
          <p className="mx-auto max-w-sm text-ui text-muted">
            No milestones yet. Add the first step — progress will be calculated from them.
          </p>
        </div>
        <form
          onSubmit={(event) => void handleAdd(event)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            aria-label="Add a milestone"
            placeholder="Add a milestone"
            value={newTitle}
            onChange={(event) => {
              setNewTitle(event.target.value);
              setAddError(null);
            }}
          />
          <Button type="submit" loading={createMilestone.isPending} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </form>
        {addError ?? (createMilestone.isError ? "Could not add the milestone. Please try again." : null) ? (
          <p role="alert" className="text-micro text-danger">
            {addError ?? "Could not add the milestone. Please try again."}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {updateMilestone.isError ? (
        <p role="alert" className="text-micro text-danger">
          Could not update the milestone. Please try again.
        </p>
      ) : null}
      {reorderMilestones.isError ? (
        <p role="alert" className="text-micro text-danger">
          Could not reorder milestones. Please try again.
        </p>
      ) : null}
      {deleteMilestone.isError ? (
        <p role="alert" className="text-micro text-danger">
          Could not delete the milestone. Please try again.
        </p>
      ) : null}

      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {sorted.map((milestone, index) => {
          const completed = milestone.status === "completed";
          return (
            <li key={milestone.id} className="flex items-start gap-3 px-4 py-3">
              <label
                htmlFor={`milestone-${milestone.id}`}
                className="-m-3.5 inline-flex shrink-0 cursor-pointer p-3.5"
              >
                <input
                  id={`milestone-${milestone.id}`}
                  type="checkbox"
                  checked={completed}
                  onChange={() => handleToggle(milestone)}
                  aria-label={
                    completed
                      ? `Mark ${milestone.title} as pending`
                      : `Mark ${milestone.title} as completed`
                  }
                  className="mt-0.5 size-4 shrink-0 accent-current"
                />
              </label>
              <div className="min-w-0 flex-1">
                <p
                  title={milestone.title}
                  className={
                    completed ? "truncate text-ui text-muted line-through" : "truncate text-ui text-content"
                  }
                >
                  {milestone.title}
                </p>
                {milestone.targetDate ? (
                  <p className="text-micro text-muted tabular-nums">{milestone.targetDate}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative after:absolute after:-inset-1 after:content-['']"
                  aria-label={`Move ${milestone.title} up`}
                  disabled={index === 0 || reorderMilestones.isPending}
                  onClick={() => handleMove(index, -1)}
                >
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative after:absolute after:-inset-1 after:content-['']"
                  aria-label={`Move ${milestone.title} down`}
                  disabled={index === sorted.length - 1 || reorderMilestones.isPending}
                  onClick={() => handleMove(index, 1)}
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative after:absolute after:-inset-1 after:content-['']"
                  onClick={() => setEditing(milestone)}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative after:absolute after:-inset-1 after:content-['']"
                  onClick={() => setDeleting(milestone)}
                  aria-label={`Delete ${milestone.title}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={(event) => void handleAdd(event)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Add a milestone"
          placeholder="Add a milestone"
          value={newTitle}
          onChange={(event) => {
            setNewTitle(event.target.value);
            setAddError(null);
          }}
        />
        <Button type="submit" loading={createMilestone.isPending} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </form>
      {addError ?? (createMilestone.isError ? "Could not add the milestone. Please try again." : null) ? (
        <p role="alert" className="text-micro text-danger">
          {addError ?? "Could not add the milestone. Please try again."}
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
