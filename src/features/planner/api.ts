import { getSupabaseClient } from "@/lib/supabase/client";
import { mapTimeBlockRowToTimeBlock, type TimeBlocksRow } from "@/types/database";
import type { BlockType, TimeBlock } from "@/types/domain";

import { BlockServiceError, BLOCK_ERROR_MESSAGES, toBlockError } from "./errors";
import { applyPlanSchema, type ApplyPlanInput, type CreateBlockInput, type UpdateBlockInput } from "./schemas";

/**
 * Half-open overlap window for one fetch: `[from, to)` as ISO instants.
 * `listBlocks` returns every block with `end_time > from` and
 * `start_time < to` in a single query; grouping by day happens on the
 * client (plan.md Unit 3: one request per range, no N+1).
 */
export interface BlockRange {
  from: string;
  to: string;
}

/**
 * Identity comes from the local session (`auth.getSession()`), never from
 * a caller-provided `user_id`. RLS (`user_id = auth.uid()`) is the second
 * layer. No function here accepts a `user_id` argument. An expired token
 * still fails at PostgREST with 401, mapped to `forbidden` below.
 */
async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw toBlockError(error);
  }

  if (!data.session?.user) {
    throw new BlockServiceError("forbidden", BLOCK_ERROR_MESSAGES.forbidden);
  }

  return data.session.user.id;
}

/**
 * Д4 service guard (mirrors the 0005 CHECKs): a task block always points
 * at its task, and only a task block may point at a task. The database
 * CHECKs stay the final guard (mapped to `validation` via 23514); this
 * throws the same code earlier with a human message.
 */
function assertValidBlockLink(blockType: BlockType, taskId: string | null): void {
  if (blockType === "task" && taskId === null) {
    throw new BlockServiceError(
      "validation",
      "A task block must link to a task. Choose a task or change the block type.",
    );
  }

  if (blockType !== "task" && taskId !== null) {
    throw new BlockServiceError(
      "validation",
      "Only task blocks can link to a task. Clear the task or change the block type to task.",
    );
  }
}

/**
 * Ownership guard for the linked task (same posture as 0004 RLS EXISTS
 * checks and tasks' `assertMilestoneBelongsToGoal`): the task must exist
 * and belong to the caller. RLS alone would hide a forged link but the
 * 0005 `EXISTS` policy rejects the write; this surfaces the same shape
 * earlier as `validation` with a human message. Network failures pass
 * through untouched.
 */
async function assertTaskOwnedByUser(taskId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (error) {
    const mapped = toBlockError(error);
    if (mapped.code === "network") {
      throw mapped;
    }
    throw new BlockServiceError(
      "validation",
      "The selected task was not found. Please reload and choose another task.",
    );
  }

  if (!data) {
    throw new BlockServiceError(
      "validation",
      "The selected task was not found. Please reload and choose another task.",
    );
  }
}

type BlocksClient = ReturnType<typeof getSupabaseClient>;

/** One task's mirror pair, ready to write. */
interface TaskMirrorWrite {
  taskId: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}

/**
 * The mirror pair a task must carry once `removedBlockId` stops belonging to
 * it: the earliest remaining block, or a cleared pair when none is left.
 *
 * One rule, two callers (a deleted block and a block moved to another task), so
 * `scheduled_start` / `scheduled_end` can never point at a block that is not
 * there — the Dashboard reads tasks, not blocks (Д8).
 */
async function mirrorAfterBlockLeavesTask(
  client: BlocksClient,
  userId: string,
  taskId: string,
  removedBlockId: string,
): Promise<TaskMirrorWrite> {
  const { data, error } = await client
    .from("time_blocks")
    .select("start_time,end_time")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .neq("id", removedBlockId)
    .order("start_time", { ascending: true })
    .limit(1);

  if (error) {
    throw toBlockError(error);
  }

  const survivor = (Array.isArray(data) ? data : [])[0] as
    | Pick<TimeBlocksRow, "start_time" | "end_time">
    | undefined;

  return survivor
    ? { taskId, scheduledStart: survivor.start_time, scheduledEnd: survivor.end_time }
    : { taskId, scheduledStart: null, scheduledEnd: null };
}

/**
 * Every mirror write of one block mutation, sent as a single batch: a relink
 * writes both the previous and the new task in one await with the requests
 * dispatched side by side, so the previous task can no longer be left showing
 * a schedule with no block behind it (the gap unit 3 left open).
 *
 * PostgREST cannot update two rows with different values in one statement and
 * the mirror has no RPC (no migration in this unit), so "one batch" means one
 * round trip of two writes rather than one SQL statement. The first failure is
 * rethrown as a coded error; neither write is retried here.
 */
async function writeTaskMirrors(
  client: BlocksClient,
  userId: string,
  writes: readonly TaskMirrorWrite[],
): Promise<void> {
  if (writes.length === 0) {
    return;
  }

  const results = await Promise.all(
    writes.map((write) =>
      client
        .from("tasks")
        .update({ scheduled_start: write.scheduledStart, scheduled_end: write.scheduledEnd })
        .eq("id", write.taskId)
        .eq("user_id", userId),
    ),
  );

  const failed = results.find((result) => result.error);

  if (failed?.error) {
    throw toBlockError(failed.error);
  }
}

/**
 * One query per range, ordered by start. Overlap is strict (`end > from`
 * and `start < to`): a block ending exactly at the range start belongs to
 * the previous day, matching the planner lib where touching edges are not
 * conflicts. No per-day fan-out here — callers group the result.
 */
export async function listBlocks(range: BlockRange): Promise<TimeBlock[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("time_blocks")
      .select("*")
      .eq("user_id", userId)
      .gt("end_time", range.from)
      .lt("start_time", range.to)
      .order("start_time", { ascending: true });

    if (error) {
      throw toBlockError(error);
    }

    return ((data ?? []) as TimeBlocksRow[]).map(mapTimeBlockRowToTimeBlock);
  } catch (error) {
    throw toBlockError(error);
  }
}

export async function createBlock(input: CreateBlockInput): Promise<TimeBlock> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const taskId = input.taskId ?? null;
    assertValidBlockLink(input.blockType, taskId);

    if (taskId !== null) {
      await assertTaskOwnedByUser(taskId, userId);
    }

    const payload: Omit<TimeBlocksRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      task_id: taskId,
      title: input.title.trim(),
      start_time: input.startTime,
      end_time: input.endTime,
      block_type: input.blockType,
    };

    const { data, error } = await client.from("time_blocks").insert(payload).select().single();

    if (error) {
      throw toBlockError(error);
    }

    return mapTimeBlockRowToTimeBlock(data as TimeBlocksRow);
  } catch (error) {
    throw toBlockError(error);
  }
}

/**
 * Partial update. When the patch touches either side of the
 * block-type/task pair, the effective post-patch pair is resolved against
 * the stored row first — changing only `blockType` to `task` keeps the
 * existing link, and unlinking the goal-side equivalent (setting `taskId`
 * to null on a task block) is rejected instead of storing an orphan.
 * This function contains no scheduling math and no overdue logic.
 *
 * Д8 mirror rule: the task mirror (`scheduled_start` / `scheduled_end`)
 * always points at an existing block. When the patch moves either edge
 * (`startTime` and/or `endTime`) of a task block, the linked task is
 * updated with the final row's pair in one `update` by `id + user_id`.
 * When the patch changes the link itself — another task, or a type change
 * that drops the task — BOTH tasks are written in one batch: the old one is
 * repointed at its earliest remaining block or cleared, the new one gets the
 * final pair. Blocks without a task (`break`/`personal`) never touch `tasks`.
 * A failed mirror write throws (code from `errors.ts`) instead of silently
 * returning the updated block — the block row stays changed, the caller
 * sees the error.
 */
export async function updateBlock(id: string, patch: UpdateBlockInput): Promise<TimeBlock> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const touchesLink = patch.blockType !== undefined || patch.taskId !== undefined;

    let current: TimeBlocksRow | null = null;
    if (touchesLink) {
      const { data, error } = await client
        .from("time_blocks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw toBlockError(error);
      }

      current = data as TimeBlocksRow;
    }

    if (touchesLink && current) {
      const effectiveBlockType = patch.blockType ?? current.block_type;
      const effectiveTaskId = patch.taskId !== undefined ? patch.taskId : current.task_id;
      assertValidBlockLink(effectiveBlockType, effectiveTaskId);

      if (effectiveTaskId !== null) {
        const needsOwnershipCheck =
          patch.taskId !== undefined || patch.blockType !== undefined;
        if (needsOwnershipCheck) {
          await assertTaskOwnedByUser(effectiveTaskId, userId);
        }
      }
    }

    const payload: Partial<TimeBlocksRow> = {};

    if (patch.title !== undefined) {
      payload.title = patch.title.trim();
    }
    if (patch.startTime !== undefined) {
      payload.start_time = patch.startTime;
    }
    if (patch.endTime !== undefined) {
      payload.end_time = patch.endTime;
    }
    if (patch.blockType !== undefined) {
      payload.block_type = patch.blockType;
    }
    if (patch.taskId !== undefined) {
      payload.task_id = patch.taskId;
    }

    if (Object.keys(payload).length === 0) {
      if (current) {
        return mapTimeBlockRowToTimeBlock(current);
      }

      const { data, error } = await client
        .from("time_blocks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw toBlockError(error);
      }

      return mapTimeBlockRowToTimeBlock(data as TimeBlocksRow);
    }

    const { data, error } = await client
      .from("time_blocks")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toBlockError(error);
    }

    const updatedRow = data as TimeBlocksRow;
    const touchesTime = patch.startTime !== undefined || patch.endTime !== undefined;
    const nextTaskId = updatedRow.task_id;
    // `current` is read only when the patch touches the link, and then it is
    // exact — never "no previous task" by accident.
    const previousTaskId = current?.task_id ?? null;
    const relinked = current !== null && previousTaskId !== nextTaskId;
    const mirrorWrites: TaskMirrorWrite[] = [];

    if (relinked && previousTaskId !== null) {
      // The old task loses this block: repoint its mirror at whatever it still
      // has, or clear it. Without this the old task keeps a phantom schedule.
      mirrorWrites.push(
        await mirrorAfterBlockLeavesTask(client, userId, previousTaskId, id),
      );
    }

    if (nextTaskId !== null && (relinked || touchesTime)) {
      mirrorWrites.push({
        taskId: nextTaskId,
        scheduledStart: updatedRow.start_time,
        scheduledEnd: updatedRow.end_time,
      });
    }

    await writeTaskMirrors(client, userId, mirrorWrites);

    return mapTimeBlockRowToTimeBlock(updatedRow);
  } catch (error) {
    throw toBlockError(error);
  }
}

/**
 * Д8: the task mirror (`scheduled_start` / `scheduled_end`) always points
 * at an existing block, otherwise the Dashboard — which reads tasks, not
 * blocks — would keep showing "scheduled" with no block behind it (or lie
 * the opposite way: "not scheduled" while a block exists). One service
 * call from the caller's perspective (a single mutation, a single error
 * channel): fetch the link, then with a single remaining-blocks query
 * (no loops) decide the mirror — repoint it at the surviving block when
 * the task keeps another block, clear it to null only when no blocks
 * remain — then delete the block. Break/personal blocks skip the tasks
 * write entirely. A failed mirror write throws before the delete, so the
 * block stays and the caller sees the error.
 */
export async function deleteBlock(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data: current, error: currentError } = await client
      .from("time_blocks")
      .select("task_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (currentError) {
      throw toBlockError(currentError);
    }

    const taskId = (current as Pick<TimeBlocksRow, "task_id"> | null)?.task_id ?? null;

    if (taskId !== null) {
      const mirror = await mirrorAfterBlockLeavesTask(client, userId, taskId, id);
      await writeTaskMirrors(client, userId, [mirror]);
    }

    const { error: deleteError } = await client
      .from("time_blocks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      throw toBlockError(deleteError);
    }
  } catch (error) {
    throw toBlockError(error);
  }
}

/** One accepted proposal slot: a `task` block for one task, UTC instants. */
export interface ApplyPlanSlot {
  taskId: string;
  title: string;
  start: string;
  end: string;
}

export interface ApplyPlanResult {
  /** Blocks created by this call. Empty when every pair already existed. */
  blocks: TimeBlock[];
  /** Tasks whose mirror was rewritten by this call. */
  mirroredTaskIds: string[];
}

function planSlotKey(taskId: string, start: string, end: string): string {
  return `${taskId}|${start}|${end}`;
}

/**
 * Batch accept of a plan preview (plan.md Unit 9): the only preview path
 * that writes. Every slot becomes a `block_type = 'task'` block and the
 * linked task's `scheduled_start` / `scheduled_end` mirror is rewritten in
 * the same call through the shared `writeTaskMirrors` batch.
 *
 * Idempotency without a migration: the existing pairs are read with one
 * query over the plan's own span and only the missing ones are inserted, so
 * a repeated Accept of the same plan inserts nothing and mirrors nothing.
 * Identity comes from the JWT (`requireUserId`); RLS stays untouched.
 *
 * Partial failure is never silent: an insert failure throws before any
 * mirror write; a mirror failure after a successful insert throws the coded
 * error while the created blocks stay in the database (two parallel
 * requests, not a transaction — a future RPC would make it atomic).
 */
export async function applyPlan(input: ApplyPlanInput): Promise<ApplyPlanResult> {
  try {
    const userId = await requireUserId();

    const parsed = applyPlanSchema.safeParse(input);

    if (!parsed.success) {
      throw new BlockServiceError("validation", BLOCK_ERROR_MESSAGES.validation);
    }

    // A duplicated pair inside one call must not become two blocks.
    const seen = new Set<string>();
    const slots: ApplyPlanSlot[] = [];

    for (const slot of parsed.data.slots) {
      const key = planSlotKey(slot.taskId, slot.start, slot.end);

      if (!seen.has(key)) {
        seen.add(key);
        slots.push({ taskId: slot.taskId, title: slot.title, start: slot.start, end: slot.end });
      }
    }

    if (slots.length === 0) {
      return { blocks: [], mirroredTaskIds: [] };
    }

    const client = getSupabaseClient();
    const taskIds = [...new Set(slots.map((slot) => slot.taskId))];

    // One query for every linked task: each must exist and belong to the caller.
    const { data: ownedTasks, error: ownedError } = await client
      .from("tasks")
      .select("id,title")
      .eq("user_id", userId)
      .in("id", taskIds);

    if (ownedError) {
      throw toBlockError(ownedError);
    }

    const titlesById = new Map<string, string>(
      ((ownedTasks ?? []) as Array<{ id: string; title: string | null }>).map((row) => [
        row.id,
        row.title ?? "",
      ]),
    );

    if (titlesById.size !== taskIds.length) {
      throw new BlockServiceError(
        "validation",
        "The selected task was not found. Please reload and choose another task.",
      );
    }

    const resolved = slots.map((slot) => {
      const title = slot.title.trim() || titlesById.get(slot.taskId)?.trim() || "";

      if (title === "") {
        throw new BlockServiceError("validation", BLOCK_ERROR_MESSAGES.validation);
      }

      return { ...slot, title };
    });

    // One query for every pair: the blocks overlapping the plan's own span,
    // narrowed to exact (`task_id`, `start_time`, `end_time`) matches here.
    // A slot always lies strictly inside [minStart, maxEnd), so the strict
    // window cannot miss a pair it is looking for.
    const minStart = resolved.reduce(
      (min, slot) => (slot.start < min ? slot.start : min),
      resolved[0].start,
    );
    const maxEnd = resolved.reduce(
      (max, slot) => (slot.end > max ? slot.end : max),
      resolved[0].end,
    );

    const { data: existing, error: existingError } = await client
      .from("time_blocks")
      .select("task_id,start_time,end_time")
      .eq("user_id", userId)
      .gt("end_time", minStart)
      .lt("start_time", maxEnd)
      .order("start_time", { ascending: true });

    if (existingError) {
      throw toBlockError(existingError);
    }

    const present = new Set(
      ((existing ?? []) as Array<Pick<TimeBlocksRow, "task_id" | "start_time" | "end_time">>).map(
        (row) => planSlotKey(row.task_id ?? "", row.start_time, row.end_time),
      ),
    );
    const missing = resolved.filter(
      (slot) => !present.has(planSlotKey(slot.taskId, slot.start, slot.end)),
    );

    if (missing.length === 0) {
      return { blocks: [], mirroredTaskIds: [] };
    }

    const payload: Array<Omit<TimeBlocksRow, "id" | "created_at" | "updated_at">> = missing.map(
      (slot) => ({
        user_id: userId,
        task_id: slot.taskId,
        title: slot.title,
        start_time: slot.start,
        end_time: slot.end,
        block_type: "task",
      }),
    );

    const { data: inserted, error: insertError } = await client
      .from("time_blocks")
      .insert(payload)
      .select();

    if (insertError) {
      throw toBlockError(insertError);
    }

    const rows = (inserted ?? []) as TimeBlocksRow[];
    const blocks = rows.map(mapTimeBlockRowToTimeBlock);

    // One task carries at most one new block (Д3: no splitting), but the
    // batch stays keyed by task so a repeated or multi-slot plan cannot
    // write one task twice: the earliest new block wins the mirror.
    const earliestByTask = new Map<string, TimeBlocksRow>();

    for (const row of rows) {
      const current = earliestByTask.get(row.task_id ?? "");

      if (row.task_id !== null && (!current || row.start_time < current.start_time)) {
        earliestByTask.set(row.task_id, row);
      }
    }

    await writeTaskMirrors(
      client,
      userId,
      [...earliestByTask].map(([taskId, row]) => ({
        taskId,
        scheduledStart: row.start_time,
        scheduledEnd: row.end_time,
      })),
    );

    return { blocks, mirroredTaskIds: [...earliestByTask.keys()] };
  } catch (error) {
    throw toBlockError(error);
  }
}
