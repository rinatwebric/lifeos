import { AlertTriangle } from "lucide-react";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { isoToLocalDateTime, localDateTimeToIso } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Messages } from "@/lib/i18n/I18nContext";
import { findConflicts, type PlanBlock, type WeeklyAvailability } from "@/lib/planner";

import { formatDurationMinutes } from "./usePlannerDay";

/**
 * Local-only slot editor for the plan accept panel (plan.md Unit 9).
 *
 * Nothing here writes: time edits only change the parent's state, conflicts
 * are rechecked through `findConflicts` (Д2 — the same function the day view
 * uses), and a conflicting plan needs an explicit opt-in before the parent
 * calls `applyPlan`. Consent is keyed by the exact draft (see the panel), so
 * any change drops it — the same posture as `TimeBlockDialog` in Unit 7.
 */

/** One proposal slot as the editor holds it: instants, display in the zone. */
export interface EditablePlanSlot {
  taskId: string;
  taskTitle: string;
  start: string;
  end: string;
}

export type PlanSlotWarningKind = "overlap" | "sleep" | "past" | "invalid";

export interface PlanSlotWarning {
  /** Null for panel-level notes; otherwise the slot the warning belongs to. */
  taskId: string | null;
  kind: PlanSlotWarningKind;
  message: string;
}

export interface PlanSlotWarningsInput {
  slots: readonly EditablePlanSlot[];
  /** Blocks already on the day: the edited slots are checked against them. */
  blocks: readonly PlanBlock[];
  now: Date;
  timeZone: string;
  /** Null when the user has no preferences row: waking hours stay unknown. */
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
}

/** Pseudo ids: `findConflicts` reports conflicts by block id. */
function draftId(taskId: string): string {
  return `plan:${taskId}`;
}

const FALLBACK_WAKE_UP = "00:00";
const FALLBACK_SLEEP = "23:59";

const INVALID_MESSAGE =
  "This planned time ends before it starts. Fix the times before accepting.";
const OVERLAP_MESSAGE =
  "This planned time overlaps with another block. Both stay in your plan and are marked as overlapping.";
const PAST_MESSAGE =
  "This planned time is in the past. It stays as a record of what already happened.";

function sleepMessage(wakeUpTime: string, sleepTime: string, t?: Messages["planner"]): string {
  if (t) return tmpl(t.plannedOutside, { start: wakeUpTime, end: sleepTime });
  return `This planned time runs outside your waking hours (${wakeUpTime}–${sleepTime}).`;
}

/**
 * Warnings for the edited draft, in a stable order per slot: invalid, then
 * overlap, then waking hours, then past. `work` intersections stay out —
 * they are the scheduler's soft hint, not an accept-time decision (Д2).
 */
export function collectPlanSlotWarnings(
  input: PlanSlotWarningsInput,
  t?: Messages["planner"],
): PlanSlotWarning[] {
  const hasWakingHours = input.wakeUpTime !== null && input.sleepTime !== null;
  const drafts = new Map<string, EditablePlanSlot>();
  const combined: PlanBlock[] = [...input.blocks];

  for (const slot of input.slots) {
    drafts.set(draftId(slot.taskId), slot);
    combined.push({ id: draftId(slot.taskId), startTime: slot.start, endTime: slot.end });
  }

  const conflicts = findConflicts(combined, {
    now: input.now,
    timeZone: input.timeZone,
    wakeUpTime: input.wakeUpTime ?? FALLBACK_WAKE_UP,
    sleepTime: input.sleepTime ?? FALLBACK_SLEEP,
    workingHours: input.workingHours ?? {},
    studyHours: input.studyHours ?? {},
  });

  const kindsByDraft = new Map<string, Set<Exclude<PlanSlotWarningKind, "invalid">>>();

  function mark(id: string, kind: Exclude<PlanSlotWarningKind, "invalid">): void {
    let kinds = kindsByDraft.get(id);

    if (!kinds) {
      kinds = new Set();
      kindsByDraft.set(id, kinds);
    }

    kinds.add(kind);
  }

  for (const conflict of conflicts) {
    // An overlap is reported once, on the later block: both draft sides keep it.
    if (conflict.kind === "overlap") {
      for (const id of [conflict.blockId, conflict.otherId]) {
        if (id !== undefined && drafts.has(id)) {
          mark(id, "overlap");
        }
      }

      continue;
    }

    if (!drafts.has(conflict.blockId)) {
      continue;
    }

    if (conflict.kind === "work") {
      continue;
    }

    if (conflict.kind === "sleep" && !hasWakingHours) {
      continue;
    }

    mark(conflict.blockId, conflict.kind);
  }

  const warnings: PlanSlotWarning[] = [];

  for (const slot of input.slots) {
    const startMs = Date.parse(slot.start);
    const endMs = Date.parse(slot.end);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      warnings.push({ taskId: slot.taskId, kind: "invalid", message: t?.plannedEndsBeforeStart ?? INVALID_MESSAGE });
      continue;
    }

    const kinds = kindsByDraft.get(draftId(slot.taskId));

    if (!kinds) {
      continue;
    }

    if (kinds.has("overlap")) {
      warnings.push({ taskId: slot.taskId, kind: "overlap", message: t?.plannedOverlap ?? OVERLAP_MESSAGE });
    }

    if (
      kinds.has("sleep") &&
      input.wakeUpTime !== null &&
      input.sleepTime !== null
    ) {
      warnings.push({
        taskId: slot.taskId,
        kind: "sleep",
        message: sleepMessage(input.wakeUpTime, input.sleepTime, t),
      });
    }

    if (kinds.has("past")) {
      warnings.push({ taskId: slot.taskId, kind: "past", message: t?.plannedPast ?? PAST_MESSAGE });
    }
  }

  return warnings;
}

/** Reads a `datetime-local` value as wall time in `timeZone`, UTC instant out. */
function wallTimeToIso(local: string, timeZone: string): string | null {
  if (local.trim() === "") {
    return null;
  }

  try {
    return localDateTimeToIso(local, timeZone);
  } catch {
    return null;
  }
}

export interface PlanSlotEditorProps {
  slots: readonly EditablePlanSlot[];
  timeZone: string;
  warnings: readonly PlanSlotWarning[];
  acknowledged: boolean;
  ackError: string | null;
  onAcknowledgeChange: (acknowledged: boolean) => void;
  onChangeSlot: (taskId: string, patch: { start?: string; end?: string }) => void;
}

function SlotTimeField({
  id,
  label,
  valueIso,
  timeZone,
  onCommit,
}: {
  id: string;
  label: string;
  valueIso: string;
  timeZone: string;
  onCommit: (iso: string) => void;
}) {
  return (
    <Field id={id} label={label} required>
      <Input
        type="datetime-local"
        className="min-h-11 tabular-nums"
        value={isoToLocalDateTime(valueIso, timeZone)}
        onChange={(event) => {
          const iso = wallTimeToIso(event.target.value, timeZone);

          if (iso !== null) {
            onCommit(iso);
          }
        }}
      />
    </Field>
  );
}

export function PlanSlotEditor({
  slots,
  timeZone,
  warnings,
  acknowledged,
  ackError,
  onAcknowledgeChange,
  onChangeSlot,
}: PlanSlotEditorProps) {
  const m = useMessages();
  const locale = useLocale();
  const t = m.planner;

  if (slots.length === 0) {
    return null;
  }

  const warningsBySlot = new Map<string, PlanSlotWarning[]>();

  for (const warning of warnings) {
    if (warning.taskId === null) {
      continue;
    }

    const list = warningsBySlot.get(warning.taskId) ?? [];
    list.push(warning);
    warningsBySlot.set(warning.taskId, list);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-ui font-medium text-content">{t.adjustTimes}</h3>
        <p className="text-ui text-muted text-pretty">
          {t.adjustHint}
        </p>
      </div>

      <ul className="space-y-3">
        {slots.map((slot) => {
          const durationMs = Date.parse(slot.end) - Date.parse(slot.start);
          const slotWarnings = warningsBySlot.get(slot.taskId) ?? [];

          return (
            <li
              key={slot.taskId}
              className="space-y-3 rounded-control border border-line bg-surface-muted p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-ui font-medium text-content text-pretty">{slot.taskTitle}</p>
                <span className="text-micro text-muted tabular-nums">
                  {Number.isFinite(durationMs) && durationMs > 0
                    ? formatDurationMinutes(Math.round(durationMs / 60_000), locale)
                    : t.durationUnset}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SlotTimeField
                  id={`plan-slot-start-${slot.taskId}`}
                  label={tmpl(t.startsFor, { title: slot.taskTitle })}
                  valueIso={slot.start}
                  timeZone={timeZone}
                  onCommit={(start) => onChangeSlot(slot.taskId, { start })}
                />
                <SlotTimeField
                  id={`plan-slot-end-${slot.taskId}`}
                  label={tmpl(t.endsFor, { title: slot.taskTitle })}
                  valueIso={slot.end}
                  timeZone={timeZone}
                  onCommit={(end) => onChangeSlot(slot.taskId, { end })}
                />
              </div>
              {slotWarnings.length > 0 ? (
                <ul className="list-disc space-y-1 ps-4 text-ui text-muted text-pretty">
                  {slotWarnings.map((warning) => (
                    <li key={warning.kind}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {warnings.length > 0 ? (
        <div className="space-y-2 rounded-control border border-danger-border bg-danger-subtle p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-ui font-medium text-content">
              {t.checkTimes}
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-ui font-medium text-content">
            <input
              type="checkbox"
              className="size-5 accent-current"
              checked={acknowledged}
              onChange={(event) => onAcknowledgeChange(event.target.checked)}
            />
            {t.keepPlanAnyway}
          </label>
          {ackError ? (
            <p role="alert" className="text-micro text-danger">
              {ackError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
