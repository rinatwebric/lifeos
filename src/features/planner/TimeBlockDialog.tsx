import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getPreferences, preferencesQueryKey } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks as taskKeys } from "@/features/tasks/queryKeys";
import { isoToLocalDateTime } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import { BLOCK_TYPES, type BlockType } from "@/types/domain";

import { listBlocks } from "./api";
import {
  buildBlockInput,
  draftDurationMinutes,
  resolveBlockTitle,
  wallTimeToIso,
  type BlockFormErrors,
  type BlockFormValues,
  type BlockTaskOption,
} from "./blockForm";
import { collectBlockWarnings, describeBlockError } from "./blockMessages";
import { useCreateBlock, useUpdateBlock } from "./hooks";
import { planner } from "./queryKeys";
import { formatDurationMinutes, plannerDayBounds, readWallTime } from "./usePlannerDay";

/**
 * Create/edit dialog for a manual time block (plan.md Unit 7).
 *
 * Decisions baked in:
 * - One dialog, two modes (`block === null` → create). The payload has the same
 *   shape in both, so a single validation path covers it.
 * - Wall time only: the two `datetime-local` fields are read in the profile
 *   time zone through `localDateTimeToIso`; the way back for editing goes
 *   through `isoToLocalDateTime`. The browser zone never decides an instant.
 * - Conflicts are never refused silently (PRD §18). `collectBlockWarnings`
 *   reports overlaps, waking hours and the past; the user must tick
 *   "Keep this block at this time anyway" before the write happens.
 * - The block reads its reference data through the query keys the day view
 *   already fills (`planner.range`, `tasks.list`, `preferences`), so opening it
 *   from the day view costs no extra request.
 * - Deleting is a separate dialog: this one asks the page to open it, so two
 *   modals never stack.
 */

/** A new block starts at 09:00 local on the selected day; one hour long. */
const DEFAULT_START_TIME = "T09:00";
const DEFAULT_END_TIME = "T10:00";

/** What the editor needs from a stored block; the day view supplies it. */
export interface EditableTimeBlock {
  id: string;
  taskId: string | null;
  blockType: BlockType;
  title: string;
  startTime: string;
  endTime: string;
}

export interface TimeBlockDialogProps {
  open: boolean;
  onClose: () => void;
  /** Profile time zone: every wall time in the dialog is read in it. */
  timeZone: string;
  /** Day the block belongs to (YYYY-MM-DD in `timeZone`). */
  dateKey: string;
  /** Existing block → edit mode; `null` → create mode. */
  block: EditableTimeBlock | null;
  /** Opens the delete confirmation; the page owns it so dialogs never nest. */
  onRequestDelete?: (block: EditableTimeBlock) => void;
  now?: Date;
}

function initialValues(
  block: EditableTimeBlock | null,
  dateKey: string,
  timeZone: string,
): BlockFormValues {
  if (block) {
    return {
      blockType: block.blockType,
      taskId: block.taskId ?? "",
      title: block.title,
      startLocal: isoToLocalDateTime(block.startTime, timeZone),
      endLocal: isoToLocalDateTime(block.endTime, timeZone),
    };
  }

  return {
    blockType: "task",
    taskId: "",
    title: "",
    startLocal: `${dateKey}${DEFAULT_START_TIME}`,
    endLocal: `${dateKey}${DEFAULT_END_TIME}`,
  };
}

export function TimeBlockDialog({
  open,
  onClose,
  timeZone,
  dateKey,
  block,
  onRequestDelete,
  now,
}: TimeBlockDialogProps) {
  const m = useMessages();
  const t = m.planner;
  const locale = useLocale();
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();

  const [form, setForm] = useState<BlockFormValues>(() => initialValues(block, dateKey, timeZone));
  const [fieldErrors, setFieldErrors] = useState<BlockFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  // Re-sync on every open (a render-phase adjustment, not an effect): an
  // abandoned edit never leaks into the next dialog.
  const openKey = open ? (block?.id ?? "new") : null;
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (openKey !== syncedKey) {
    setSyncedKey(openKey);
    setForm(initialValues(block, dateKey, timeZone));
    setFieldErrors({});
    setServerError(null);
    setAcknowledgedKey(null);
    setAckError(null);
  }

  // Same keys as the day view: cached when the dialog is opened from it.
  const bounds = plannerDayBounds(dateKey, timeZone);
  const range = { from: bounds.start, to: bounds.end };
  const blocksQuery = useQuery({
    queryKey: planner.range(range),
    queryFn: () => listBlocks(range),
    enabled: open,
    staleTime: 30_000,
  });
  const tasksQuery = useQuery({
    queryKey: taskKeys.list(),
    queryFn: () => listTasks(),
    enabled: open,
    staleTime: 60_000,
  });
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    enabled: open,
    staleTime: 60_000,
  });

  const taskOptions: BlockTaskOption[] = (tasksQuery.data ?? []).map((task) => ({
    id: task.id,
    title: task.title,
  }));
  const linkedTaskId = block?.taskId ?? null;

  // A block always points at a live task (cascade delete), but the task list is
  // capped: keep the linked task selectable even when it falls outside it.
  if (linkedTaskId !== null && !taskOptions.some((task) => task.id === linkedTaskId)) {
    taskOptions.unshift({ id: linkedTaskId, title: block?.title ?? t.linkedTaskFallback });
  }

  const blockTypeHint =
    form.blockType === "task" ? t.taskBlockHint : form.blockType === "break" ? t.breakHint : t.personalHint;

  const startIso = wallTimeToIso(form.startLocal, timeZone);
  const endIso = wallTimeToIso(form.endLocal, timeZone);
  const durationMinutes = draftDurationMinutes(form, timeZone);
  const warnings =
    startIso !== null && endIso !== null
      ? collectBlockWarnings(
          {
            startTime: startIso,
            endTime: endIso,
            blocks: (blocksQuery.data ?? []).map((other) => ({
              id: other.id,
              start: other.startTime,
              end: other.endTime,
            })),
            editedBlockId: block?.id ?? null,
            now: now ?? new Date(),
            timeZone,
            wakeUpTime: readWallTime(preferencesQuery.data?.wakeUpTime),
            sleepTime: readWallTime(preferencesQuery.data?.sleepTime),
          },
          t,
          locale,
        )
      : [];

  // Consent is bound to one exact draft: a different interval or a different
  // warning set needs a fresh decision, so it can never carry over silently.
  const warningsKey =
    warnings.length === 0
      ? ""
      : `${form.startLocal}|${form.endLocal}|${warnings.map((warning) => warning.kind).join("|")}`;
  const acknowledged = warningsKey !== "" && acknowledgedKey === warningsKey;

  const saving = createBlock.isPending || updateBlock.isPending;

  const updateField = <Key extends keyof BlockFormValues>(
    field: Key,
    value: BlockFormValues[Key],
  ): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setAckError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (saving) {
      return;
    }

    setServerError(null);
    setAckError(null);

    const result = buildBlockInput(form, {
      timeZone,
      tasks: taskOptions,
      missingStart: t.chooseStart,
      missingEnd: t.chooseEnd,
      missingTask: t.chooseTask,
      v: { ...m.validation, schemaEndAfterStart: t.schemaEndAfterStart, schemaTaskLink: t.schemaTaskLink },
    });

    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }

    setFieldErrors({});

    if (warnings.length > 0 && !acknowledged) {
      setAckError(t.tickToKeep);
      return;
    }

    try {
      if (block) {
        await updateBlock.mutateAsync({
          id: block.id,
          patch: result.input,
          previousTaskId: block.taskId,
        });
      } else {
        await createBlock.mutateAsync(result.input);
      }

      onClose();
    } catch (error) {
      setServerError(describeBlockError(error, t));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={block ? t.editBlockTitle : t.addBlockTitle}
      description={tmpl(t.chooseTimeHint, { timeZone })}
    >
      <form className="space-y-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <Field
          id="block-type"
          label={t.blockType}
          required
          hint={blockTypeHint}
        >
          <Select
            data-autofocus
            className="min-h-11"
            value={form.blockType}
            onChange={(event) => updateField("blockType", event.target.value as BlockType)}
          >
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {m.enums.blockType[type]}
              </option>
            ))}
          </Select>
        </Field>

        {form.blockType === "task" ? (
          <Field id="block-task" label={t.linkedTask} required error={fieldErrors.taskId}>
            <Select
              className="min-h-11"
              value={form.taskId}
              onChange={(event) => updateField("taskId", event.target.value)}
            >
              <option value="">{t.chooseTaskOption}</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            id="block-title"
            label={t.blockTitle}
            required
            hint={t.blockTitleHint}
            error={fieldErrors.title}
          >
            <Input
              className="min-h-11"
              maxLength={200}
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="block-start" label={t.starts} required error={fieldErrors.startTime}>
            <Input
              type="datetime-local"
              className="min-h-11 tabular-nums"
              value={form.startLocal}
              onChange={(event) => updateField("startLocal", event.target.value)}
            />
          </Field>
          <Field id="block-end" label={t.ends} required error={fieldErrors.endTime}>
            <Input
              type="datetime-local"
              className="min-h-11 tabular-nums"
              value={form.endLocal}
              onChange={(event) => updateField("endLocal", event.target.value)}
            />
          </Field>
        </div>

        <p className="text-caption text-muted tabular-nums">
          {durationMinutes === null
            ? t.durationUnset
            : tmpl(t.durationSet, { duration: formatDurationMinutes(durationMinutes) })}
        </p>

        {form.blockType === "task" && form.taskId !== "" ? (
          <p className="text-caption text-muted text-pretty">
            {tmpl(t.blockSavedAs, { title: resolveBlockTitle(form, taskOptions) })}
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <div className="space-y-2 rounded-control border border-danger-border bg-danger-subtle p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-ui font-medium text-content">{t.checkBlock}</p>
                <div role="status">
                  <ul className="list-disc space-y-1 ps-4 text-ui text-muted text-pretty">
                    {warnings.map((warning) => (
                      <li key={warning.kind}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-ui font-medium text-content">
                <input
                  type="checkbox"
                  className="size-5 accent-current"
                  checked={acknowledged}
                  onChange={(event) =>
                    setAcknowledgedKey(event.target.checked ? warningsKey : null)
                  }
                />
                {t.keepAnyway}
              </label>
              {ackError ? (
                <p role="alert" className="text-micro text-danger">
                  {ackError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {serverError ? (
          <p role="alert" className="text-ui text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {block && onRequestDelete ? (
            <Button
              variant="secondary"
              size="lg"
              disabled={saving}
              onClick={() => onRequestDelete(block)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t.deleteBlock}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="lg" disabled={saving} onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" size="lg" loading={saving}>
              {block ? t.saveChanges : t.addBlockSubmit}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
