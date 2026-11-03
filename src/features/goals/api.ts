import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapGoalRowToGoal,
  mapMilestoneRowToMilestone,
  type GoalsRow,
  type MilestonesRow,
} from "@/types/database";
import type {
  Goal,
  GoalCategory,
  GoalStatus,
  Milestone,
  MilestoneStatus,
  Priority,
} from "@/types/domain";

import { GoalServiceError, GOAL_ERROR_MESSAGES, toGoalError } from "./errors";
import type {
  CreateGoalInput,
  CreateMilestoneInput,
  UpdateGoalInput,
  UpdateMilestoneInput,
} from "./schema";

export interface GoalFilters {
  status?: GoalStatus;
  category?: GoalCategory;
  priority?: Priority;
  search?: string;
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
    throw toGoalError(error);
  }

  if (!data.session?.user) {
    throw new GoalServiceError("forbidden", GOAL_ERROR_MESSAGES.forbidden);
  }

  return data.session.user.id;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listGoals(filters?: GoalFilters): Promise<Goal[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    let query = client.from("goals").select("*").eq("user_id", userId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.category) {
      query = query.eq("category", filters.category);
    }
    if (filters?.priority) {
      query = query.eq("priority", filters.priority);
    }
    const search = filters?.search?.trim();
    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw toGoalError(error);
    }

    return (data as GoalsRow[]).map(mapGoalRowToGoal);
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function getGoal(id: string): Promise<Goal> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("goals")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      throw toGoalError(error);
    }

    if (!data) {
      throw new GoalServiceError("not_found", GOAL_ERROR_MESSAGES.not_found);
    }

    return mapGoalRowToGoal(data as GoalsRow);
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Omit<GoalsRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      title: input.title.trim(),
      description: input.description ?? null,
      category: input.category,
      priority: input.priority,
      status: input.status,
      start_date: input.startDate,
      target_date: input.targetDate ?? null,
      progress: input.progress,
      progress_mode: input.progressMode,
      completed_at: input.status === "completed" ? nowIso() : null,
    };

    const { data, error } = await client.from("goals").insert(payload).select().single();

    if (error) {
      throw toGoalError(error);
    }

    return mapGoalRowToGoal(data as GoalsRow);
  } catch (error) {
    throw toGoalError(error);
  }
}

/**
 * Partial update. The stored manual `progress` is never rewritten unless the
 * patch carries an explicit `progress` value: switching `progressMode`
 * between `manual` and `milestones` preserves the last manual number, and
 * `calculateGoalProgress` (src/lib/progress.ts) decides at read time which
 * value to display. This function contains no progress math.
 */
export async function updateGoal(id: string, patch: UpdateGoalInput): Promise<Goal> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Partial<GoalsRow> = {};

    if (patch.title !== undefined) {
      payload.title = patch.title.trim();
    }
    if (patch.description !== undefined) {
      payload.description = patch.description;
    }
    if (patch.category !== undefined) {
      payload.category = patch.category;
    }
    if (patch.priority !== undefined) {
      payload.priority = patch.priority;
    }
    if (patch.startDate !== undefined) {
      payload.start_date = patch.startDate;
    }
    if (patch.targetDate !== undefined) {
      payload.target_date = patch.targetDate;
    }
    if (patch.progress !== undefined) {
      payload.progress = patch.progress;
    }
    if (patch.progressMode !== undefined) {
      payload.progress_mode = patch.progressMode;
    }
    if (patch.status !== undefined) {
      const { data: current, error: currentError } = await client
        .from("goals")
        .select("status")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (currentError) {
        throw toGoalError(currentError);
      }
      payload.status = patch.status;
      // Never rewrite `completed_at` when the status did not change:
      // re-saving a `completed` goal must keep the original timestamp.
      if ((current as GoalsRow).status !== patch.status) {
        payload.completed_at = patch.status === "completed" ? nowIso() : null;
      }
    }

    if (Object.keys(payload).length === 0) {
      return getGoal(id);
    }

    const { data, error } = await client
      .from("goals")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toGoalError(error);
    }

    return mapGoalRowToGoal(data as GoalsRow);
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function deleteGoal(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    // Linked tasks keep their rows and lose the link (SET NULL in 0004);
    // milestones die with the goal (CASCADE in 0003). No task cascade, ever.
    const { error } = await client.from("goals").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw toGoalError(error);
    }
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function listMilestones(goalId: string): Promise<Milestone[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("milestones")
      .select("*")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toGoalError(error);
    }

    return (data as MilestonesRow[]).map(mapMilestoneRowToMilestone);
  } catch (error) {
    throw toGoalError(error);
  }
}

async function nextMilestonePosition(goalId: string, userId: string): Promise<number> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("milestones")
    .select("position")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1);

  if (error) {
    throw toGoalError(error);
  }

  const rows = data as Pick<MilestonesRow, "position">[];
  if (rows.length === 0) {
    return 0;
  }

  return rows[0].position + 1;
}

export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const position =
      input.position ?? (await nextMilestonePosition(input.goalId, userId));
    const status = input.status ?? "pending";

    const payload: Omit<MilestonesRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      goal_id: input.goalId,
      title: input.title.trim(),
      description: input.description ?? null,
      position,
      status,
      target_date: input.targetDate ?? null,
      completed_at: status === "completed" ? nowIso() : null,
    };

    const { data, error } = await client.from("milestones").insert(payload).select().single();

    if (error) {
      throw toGoalError(error);
    }

    return mapMilestoneRowToMilestone(data as MilestonesRow);
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function updateMilestone(
  id: string,
  patch: UpdateMilestoneInput,
): Promise<Milestone> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Partial<MilestonesRow> = {};

    if (patch.title !== undefined) {
      payload.title = patch.title.trim();
    }
    if (patch.description !== undefined) {
      payload.description = patch.description;
    }
    if (patch.position !== undefined) {
      payload.position = patch.position;
    }
    if (patch.targetDate !== undefined) {
      payload.target_date = patch.targetDate;
    }
    if (patch.status !== undefined) {
      payload.status = patch.status;
      payload.completed_at = patch.status === "completed" ? nowIso() : null;
    }

    if (Object.keys(payload).length === 0) {
      const { data, error } = await client
        .from("milestones")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw toGoalError(error);
      }

      return mapMilestoneRowToMilestone(data as MilestonesRow);
    }

    const { data, error } = await client
      .from("milestones")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toGoalError(error);
    }

    return mapMilestoneRowToMilestone(data as MilestonesRow);
  } catch (error) {
    throw toGoalError(error);
  }
}

export async function deleteMilestone(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error } = await client.from("milestones").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw toGoalError(error);
    }
  } catch (error) {
    throw toGoalError(error);
  }
}

/**
 * Rewrites `position` as a dense 0..n-1 sequence in the given order, so the
 * result has no gaps and no collisions. `position` is intentionally not
 * UNIQUE (reorder without deferred transactions); determinism comes from the
 * `ORDER BY position, created_at, id` read in `listMilestones`.
 */
export async function reorderMilestones(
  goalId: string,
  orderedIds: string[],
): Promise<Milestone[]> {
  try {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new GoalServiceError("validation", GOAL_ERROR_MESSAGES.validation);
    }

    const userId = await requireUserId();
    const client = getSupabaseClient();

    for (let index = 0; index < orderedIds.length; index += 1) {
      const milestoneId = orderedIds[index];
      const { error } = await client
        .from("milestones")
        .update({ position: index })
        .eq("id", milestoneId)
        .eq("goal_id", goalId)
        .eq("user_id", userId);

      if (error) {
        throw toGoalError(error);
      }
    }

    return listMilestones(goalId);
  } catch (error) {
    throw toGoalError(error);
  }
}

/**
 * Minimal milestone slice for list progress: one query over all of the
 * user's milestones, grouped by `goalId` on the client. This avoids N+1
 * (`useMilestones` per card or per task row). The `id`/`title` ride along
 * so task rows resolve milestone names from the same fetch.
 * Scaling note (also in docs/plan.md Unit 3):
 * if this ever grows large, replace with a view/RPC returning per-goal
 * counts; one fetch is enough for now.
 */
export interface MilestoneProgressSlice {
  id: string;
  goalId: string;
  title: string;
  status: MilestoneStatus;
}

export async function listAllMilestones(): Promise<MilestoneProgressSlice[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("milestones")
      .select("id,goal_id,title,status")
      .eq("user_id", userId);

    if (error) {
      throw toGoalError(error);
    }

    return ((data ?? []) as Array<{ id: string; goal_id: string; title: string; status: MilestoneStatus }>).map(
      (row) => ({
        id: row.id,
        goalId: row.goal_id,
        title: row.title,
        status: row.status,
      }),
    );
  } catch (error) {
    throw toGoalError(error);
  }
}

/**
 * Number of tasks still pointing at the goal. Shown in the delete dialog:
 * "N tasks will stay but lose the link to this goal" (SET NULL, never CASCADE).
 * Canonical implementation lives in tasks/api (single source); re-exported
 * here so existing goals imports keep working.
 */
export { countTasksForGoal } from "@/features/tasks/api";
