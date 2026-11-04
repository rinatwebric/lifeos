import { getSupabaseClient } from "@/lib/supabase/client";
import { mapTimeBlockRowToTimeBlock, type TimeBlocksRow } from "@/types/database";
import type { BlockType, TimeBlock } from "@/types/domain";

import { BlockServiceError, BLOCK_ERROR_MESSAGES, toBlockError } from "./errors";
import type { CreateBlockInput, UpdateBlockInput } from "./schemas";

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
 * Blocks without a task (`break`/`personal`) never touch `tasks`. A
 * failed mirror write throws (code from `errors.ts`) instead of silently
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

    if (touchesTime && updatedRow.task_id !== null) {
      const { error: mirrorError } = await client
        .from("tasks")
        .update({
          scheduled_start: updatedRow.start_time,
          scheduled_end: updatedRow.end_time,
        })
        .eq("id", updatedRow.task_id)
        .eq("user_id", userId);

      if (mirrorError) {
        throw toBlockError(mirrorError);
      }
    }

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
      const { data: siblings, error: siblingsError } = await client
        .from("time_blocks")
        .select("id,start_time,end_time")
        .eq("task_id", taskId)
        .eq("user_id", userId)
        .neq("id", id)
        .order("start_time", { ascending: true })
        .limit(1);

      if (siblingsError) {
        throw toBlockError(siblingsError);
      }

      const survivor = (Array.isArray(siblings) ? siblings : [])[0] as
        | Pick<TimeBlocksRow, "start_time" | "end_time">
        | undefined;

      const { error: mirrorError } = await client
        .from("tasks")
        .update(
          survivor
            ? { scheduled_start: survivor.start_time, scheduled_end: survivor.end_time }
            : { scheduled_start: null, scheduled_end: null },
        )
        .eq("id", taskId)
        .eq("user_id", userId);

      if (mirrorError) {
        throw toBlockError(mirrorError);
      }
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
