import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { getPreferences, preferencesQueryKey } from "@/features/settings/api";
import { isoToLocalDateTime } from "@/lib/dates";

import { listBlocks, type BlockRange } from "./api";
import { describeBlockError } from "./blockMessages";
import { useApplyPlan } from "./hooks";
import { planner } from "./queryKeys";
import { PlanPreview } from "./PlanPreview";
import {
  collectPlanSlotWarnings,
  PlanSlotEditor,
  type EditablePlanSlot,
} from "./PlanSlotEditor";
import { parseWeeklyAvailability, plannerDayBounds, readWallTime } from "./usePlannerDay";
import { usePlanPreview, type PlanPreview as PlanPreviewModel } from "./usePlanPreview";

/**
 * Accept panel for a plan preview (plan.md Unit 9). It mounts the Unit 8
 * `PlanPreview` with the slots from `usePlanPreview` and owns the only
 * write in the preview flow: `useApplyPlan` on Accept.
 *
 * - Generate opens the panel (reads only). Cancel and Regenerate never
 *   write: Regenerate discards the local time edits back to the computed
 *   proposal.
 * - Time edits are local until Accept: the panel shows the edited times in
 *   the preview rows (the "why" sentence stays as computed) and rechecks
 *   conflicts through `findConflicts` on every change.
 * - A conflicting draft needs the same explicit opt-in as a manual block
 *   (Unit 7): consent is bound to the exact draft and any edit drops it.
 * - After a successful Accept the panel closes; the day/week views refresh
 *   through the mutation's invalidation, not through local cache writes.
 */

const MS_PER_MINUTE = 60_000;

export interface PlanAcceptPanelProps {
  dateKey: string;
  timeZone: string;
  now: Date;
  onClose: () => void;
}

function toEditableSlots(preview: PlanPreviewModel): EditablePlanSlot[] {
  return preview.slots.map((slot) => ({
    taskId: slot.taskId,
    taskTitle: slot.taskTitle,
    start: slot.start,
    end: slot.end,
  }));
}

function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const local = isoToLocalDateTime(iso, timeZone);

  return { date: local.slice(0, 10), time: local.slice(11) };
}

/**
 * The proposal with the user's local time edits applied to the visible
 * rows. Instants, labels, durations and the midnight flag follow the edits;
 * the "why" sentence stays as computed (it explains why the task was
 * chosen, which a time nudge does not change).
 */
function toEditedPreview(
  preview: PlanPreviewModel,
  slots: readonly EditablePlanSlot[],
): PlanPreviewModel {
  const byId = new Map(slots.map((slot) => [slot.taskId, slot] as const));
  const editedSlots = preview.slots.map((slot) => {
    const edit = byId.get(slot.taskId);

    if (!edit) {
      return slot;
    }

    const start = localParts(edit.start, preview.timeZone);
    const end = localParts(edit.end, preview.timeZone);
    const durationMinutes = Math.max(
      0,
      Math.round((Date.parse(edit.end) - Date.parse(edit.start)) / MS_PER_MINUTE),
    );

    return {
      ...slot,
      start: edit.start,
      end: edit.end,
      startLabel: start.time,
      endLabel: end.time,
      crossesMidnight: start.date !== end.date,
      durationMinutes,
    };
  });
  const plannedMinutes = editedSlots.reduce((total, slot) => total + slot.durationMinutes, 0);

  return {
    ...preview,
    slots: editedSlots,
    summary: { ...preview.summary, plannedMinutes },
    canAccept: editedSlots.length > 0,
  };
}

export function PlanAcceptPanel({ dateKey, timeZone, now, onClose }: PlanAcceptPanelProps) {
  const { preview, isLoading, isError, retry } = usePlanPreview({ dateKey, now });
  const applyPlan = useApplyPlan();
  const [slots, setSlots] = useState<EditablePlanSlot[] | null>(null);
  const [synced, setSynced] = useState(false);
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Same keys the day view and the preview hook already read: cached when
  // the panel opens from the day view, no extra request.
  const bounds = plannerDayBounds(dateKey, timeZone);
  const range: BlockRange = { from: bounds.start, to: bounds.end };
  const blocksQuery = useQuery({
    queryKey: planner.range(range),
    queryFn: () => listBlocks(range),
    staleTime: 30_000,
  });
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
  });

  const previewReady = !isLoading && !isError;

  // First computed proposal seeds the editable copy; closing the panel
  // unmounts it, so an abandoned edit never leaks into the next opening.
  // Regenerate re-seeds explicitly through the same shape.
  if (previewReady && !synced) {
    setSynced(true);
    setSlots(toEditableSlots(preview));
  }

  const editableSlots = slots ?? [];
  const preferences = preferencesQuery.data;
  const warnings = collectPlanSlotWarnings({
    slots: editableSlots,
    blocks: (blocksQuery.data ?? []).map((block) => ({
      id: block.id,
      startTime: block.startTime,
      endTime: block.endTime,
    })),
    now,
    timeZone,
    wakeUpTime: readWallTime(preferences?.wakeUpTime),
    sleepTime: readWallTime(preferences?.sleepTime),
    workingHours: parseWeeklyAvailability(preferences?.workingHours),
    studyHours: parseWeeklyAvailability(preferences?.studyHours),
  });

  // Consent is bound to one exact draft: a different interval or a different
  // warning set needs a fresh decision, so it can never carry over silently.
  const warningsKey =
    warnings.length === 0
      ? ""
      : `${editableSlots.map((slot) => `${slot.taskId}${slot.start}${slot.end}`).join(",")}|${warnings.map((warning) => `${warning.taskId ?? ""}${warning.kind}`).join(",")}`;
  const acknowledged = warningsKey !== "" && acknowledgedKey === warningsKey;
  const hasInvalid = warnings.some((warning) => warning.kind === "invalid");

  const updateSlots = (next: EditablePlanSlot[]): void => {
    setSlots(next);
    setAckError(null);
    setSubmitError(null);
  };

  const handleChangeSlot = (taskId: string, patch: { start?: string; end?: string }): void => {
    updateSlots(
      editableSlots.map((slot) => (slot.taskId === taskId ? { ...slot, ...patch } : slot)),
    );
  };

  const handleRegenerate = (): void => {
    updateSlots(toEditableSlots(preview));
  };

  const handleAccept = async (): Promise<void> => {
    if (applyPlan.isPending) {
      return;
    }

    setAckError(null);
    setSubmitError(null);

    if (hasInvalid) {
      setSubmitError("Fix the times above before accepting.");
      return;
    }

    if (warnings.length > 0 && !acknowledged) {
      setAckError("Tick the box above to keep this plan at these times.");
      return;
    }

    try {
      await applyPlan.mutateAsync({
        slots: editableSlots.map((slot) => ({
          taskId: slot.taskId,
          title: slot.taskTitle,
          start: slot.start,
          end: slot.end,
        })),
      });
      onClose();
    } catch (error) {
      setSubmitError(describeBlockError(error));
    }
  };

  const editedPreview = previewReady && slots !== null ? toEditedPreview(preview, slots) : preview;

  return (
    <div className="space-y-4">
      {previewReady && editableSlots.length > 0 ? (
        <Card className="space-y-4">
          <PlanSlotEditor
            slots={editableSlots}
            timeZone={timeZone}
            warnings={warnings}
            acknowledged={acknowledged}
            ackError={ackError}
            onAcknowledgeChange={(next) => {
              setAcknowledgedKey(next ? warningsKey : null);
              setAckError(null);
            }}
            onChangeSlot={handleChangeSlot}
          />
        </Card>
      ) : null}

      {submitError ? (
        <p role="alert" className="text-ui text-danger">
          {submitError}
        </p>
      ) : null}

      <PlanPreview
        preview={editedPreview}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
        onAccept={() => void handleAccept()}
        onRegenerate={handleRegenerate}
        onCancel={onClose}
        isSaving={applyPlan.isPending}
      />
    </div>
  );
}
