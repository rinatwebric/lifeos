import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapTaskRowToTask,
  type MilestonesRow,
  type TasksRow,
} from "@/types/database";
import type { Priority, Task, TaskStatus } from "@/types/domain";

import { TaskServiceError, TASK_ERROR_MESSAGES, toTaskError } from "./errors";
import type { CreateTaskInput, UpdateTaskInput } from "./schema";

export interface TaskFilters {
  status?: TaskStatus;
  statuses?: TaskStatus[];
  priority?: Priority;
  goalId?: string;
  milestoneId?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
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
    throw toTaskError(error);
  }

  if (!data.session?.user) {
    throw new TaskServiceError("forbidden", TASK_ERROR_MESSAGES.forbidden);
  }

  return data.session.user.id;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Explicit priority ranking for the default sort (critical first).
 * Alphabetical order would put `low` before `medium`, so the rank is a
 * hand-written map — never derived from the label text.
 */
const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Default task order: `due_date` ascending with nulls last, then priority
 * descending (critical first via `PRIORITY_RANK`), then `created_at`
 * descending, then `id` ascending as a final deterministic tiebreak.
 * Runs in memory because PostgREST cannot express the priority ranking;
 * the query below still pre-orders by `due_date`/`created_at` server-side.
 * The server-side cap (`TASK_LIST_LIMIT`) bounds the in-memory sort;
 * beyond it the UI must add pagination or a server view (see plan.md Unit 5).
 */
function compareTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) {
      return 1;
    }
    if (b.dueDate === null) {
      return -1;
    }
    if (a.dueDate < b.dueDate) {
      return -1;
    }
    return 1;
  }

  const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rankDiff !== 0) {
    return rankDiff;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Server-side row cap for the task list. The default sort needs the priority
 * rank applied in memory (PostgREST has no such ordering), so the result set
 * must stay bounded; 500 rows keep the client sort instant while pagination
 * or a server-side view is still future work (see plan.md Unit 5).
 */
export const TASK_LIST_LIMIT = 500;

export async function listTasks(filters?: TaskFilters): Promise<Task[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    let query = client.from("tasks").select("*").eq("user_id", userId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      query = query.in("status", filters.statuses);
    }
    if (filters?.priority) {
      query = query.eq("priority", filters.priority);
    }
    if (filters?.goalId) {
      query = query.eq("goal_id", filters.goalId);
    }
    if (filters?.milestoneId) {
      query = query.eq("milestone_id", filters.milestoneId);
    }
    const search = filters?.search?.trim();
    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    if (filters?.dueAfter) {
      query = query.gte("due_date", filters.dueAfter);
    }
    if (filters?.dueBefore) {
      query = query.lte("due_date", filters.dueBefore);
    }
    query = query.order("due_date", { ascending: true, nullsFirst: false });
    query = query.order("created_at", { ascending: false });
    query = query.limit(TASK_LIST_LIMIT);

    const { data, error } = await query;

    if (error) {
      throw toTaskError(error);
    }

    const tasks = (data as TasksRow[]).map(mapTaskRowToTask);
    tasks.sort(compareTasks);
    return tasks;
  } catch (error) {
    throw toTaskError(error);
  }
}

export async function getTask(id: string): Promise<Task> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("tasks")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      throw toTaskError(error);
    }

    if (!data) {
      throw new TaskServiceError("not_found", TASK_ERROR_MESSAGES.not_found);
    }

    return mapTaskRowToTask(data as TasksRow);
  } catch (error) {
    throw toTaskError(error);
  }
}

/**
 * Service-level belonging rule: when both `goalId` and `milestoneId` are
 * set, the milestone must belong to that goal. There is intentionally no
 * such constraint in the database (0004 only guards cross-tenant links via
 * RLS `EXISTS` checks), so the service reads the milestone and compares
 * `goal_id` before writing. Documented in docs/plan.md, Unit 5.
 */
async function assertMilestoneBelongsToGoal(
  goalId: string | null,
  milestoneId: string | null,
  userId: string,
): Promise<void> {
  if (goalId === null || milestoneId === null) {
    return;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("milestones")
    .select("goal_id")
    .eq("id", milestoneId)
    .eq("user_id", userId)
    .single();

  if (error) {
    const mapped = toTaskError(error);
    // Network stays network; a missing (or foreign) milestone is a form-level
    // problem — RLS hides other users' rows, so "not found" and "not yours"
    // are indistinguishable by design and both surface as validation.
    if (mapped.code === "network") {
      throw mapped;
    }
    throw new TaskServiceError(
      "validation",
      "The selected milestone was not found. Please reload and choose another one.",
    );
  }

  const row = data as Pick<MilestonesRow, "goal_id">;
  if (row.goal_id !== goalId) {
    throw new TaskServiceError(
      "validation",
      "The selected milestone does not belong to the selected goal. Choose a milestone from this goal or clear it.",
    );
  }
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    // Rule "milestone without goal" (plan.md Unit 5): a milestone always
    // lives under a goal, so a new task cannot point at a milestone while
    // pointing at no goal. Reject with a form-level message instead of
    // storing an orphan link.
    if ((input.goalId ?? null) === null && (input.milestoneId ?? null) !== null) {
      throw new TaskServiceError(
        "validation",
        "Select a goal before choosing a milestone, or clear the milestone.",
      );
    }

    await assertMilestoneBelongsToGoal(input.goalId ?? null, input.milestoneId ?? null, userId);

    const payload: Omit<TasksRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      title: input.title.trim(),
      description: input.description ?? null,
      priority: input.priority,
      status: input.status,
      due_date: input.dueDate ?? null,
      scheduled_start: input.scheduledStart ?? null,
      scheduled_end: input.scheduledEnd ?? null,
      estimated_duration_minutes: input.estimatedDurationMinutes ?? null,
      goal_id: input.goalId ?? null,
      milestone_id: input.milestoneId ?? null,
      completed_at: input.status === "completed" ? nowIso() : null,
      recurrence_rule_id: null,
    };

    const { data, error } = await client.from("tasks").insert(payload).select().single();

    if (error) {
      throw toTaskError(error);
    }

    return mapTaskRowToTask(data as TasksRow);
  } catch (error) {
    throw toTaskError(error);
  }
}

/**
 * Partial update. `completed_at` is rewritten only when the status actually
 * changes (re-saving a `completed` task keeps the original timestamp);
 * link changes (`goalId`/`milestoneId`) re-run the belonging check against
 * the effective post-patch pair — except when the effective goal is null,
 * in which case the milestone link is cleared (no orphan milestones).
 * This function contains no progress math and
 * no overdue logic — overdue stays derived via `isTaskOverdue`.
 */
export async function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const touchesLinks = patch.goalId !== undefined || patch.milestoneId !== undefined;
    const touchesStatus = patch.status !== undefined;

    let current: TasksRow | null = null;
    if (touchesLinks || touchesStatus) {
      const { data, error } = await client
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw toTaskError(error);
      }

      current = data as TasksRow;
    }

    // Rule "milestone without goal" (plan.md Unit 5): the effective pair
    // after the patch decides. When the task ends up with no goal but still
    // points at a milestone — either because the goal is unlinked now or
    // because a milestone was added to a goal-less task — the service clears
    // the milestone link instead of storing an orphan. (createTask rejects
    // the same shape up front; updates clear to stay forgiving on unlink.)
    let clearOrphanMilestone = false;
    if (touchesLinks) {
      const effectiveGoalId =
        patch.goalId !== undefined ? patch.goalId : (current?.goal_id ?? null);
      const effectiveMilestoneId =
        patch.milestoneId !== undefined ? patch.milestoneId : (current?.milestone_id ?? null);
      if (effectiveGoalId === null && effectiveMilestoneId !== null) {
        clearOrphanMilestone = true;
      } else {
        await assertMilestoneBelongsToGoal(effectiveGoalId, effectiveMilestoneId, userId);
      }
    }

    const payload: Partial<TasksRow> = {};

    if (patch.title !== undefined) {
      payload.title = patch.title.trim();
    }
    if (patch.description !== undefined) {
      payload.description = patch.description;
    }
    if (patch.priority !== undefined) {
      payload.priority = patch.priority;
    }
    if (patch.status !== undefined) {
      payload.status = patch.status;
      // Never rewrite `completed_at` when the status did not change.
      if (current && current.status !== patch.status) {
        payload.completed_at = patch.status === "completed" ? nowIso() : null;
      }
    }
    if (patch.dueDate !== undefined) {
      payload.due_date = patch.dueDate;
    }
    if (patch.scheduledStart !== undefined) {
      payload.scheduled_start = patch.scheduledStart;
    }
    if (patch.scheduledEnd !== undefined) {
      payload.scheduled_end = patch.scheduledEnd;
    }
    if (patch.estimatedDurationMinutes !== undefined) {
      payload.estimated_duration_minutes = patch.estimatedDurationMinutes;
    }
    if (patch.goalId !== undefined) {
      payload.goal_id = patch.goalId;
    }
    if (patch.milestoneId !== undefined) {
      payload.milestone_id = patch.milestoneId;
    }
    if (clearOrphanMilestone) {
      payload.milestone_id = null;
    }

    if (Object.keys(payload).length === 0) {
      return getTask(id);
    }

    const { data, error } = await client
      .from("tasks")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toTaskError(error);
    }

    return mapTaskRowToTask(data as TasksRow);
  } catch (error) {
    throw toTaskError(error);
  }
}

/**
 * Status switch for the checkbox toggle. `completed` stamps `completed_at`;
 * any other status clears it (reopen). There is no `overdue` status in the
 * database and this function never writes one.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("tasks")
      .update({
        status,
        completed_at: status === "completed" ? nowIso() : null,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toTaskError(error);
    }

    return mapTaskRowToTask(data as TasksRow);
  } catch (error) {
    throw toTaskError(error);
  }
}

/** Moves the due date (`null` clears it). Past dates stay allowed: overdue is derived, not rejected. */
export async function rescheduleTask(id: string, dueDate: string | null): Promise<Task> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("tasks")
      .update({ due_date: dueDate })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toTaskError(error);
    }

    return mapTaskRowToTask(data as TasksRow);
  } catch (error) {
    throw toTaskError(error);
  }
}

export async function deleteTask(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error } = await client.from("tasks").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw toTaskError(error);
    }
  } catch (error) {
    throw toTaskError(error);
  }
}

/**
 * Number of tasks still pointing at the goal. Shown in the goal delete
 * dialog: "N tasks will stay but lose the link to this goal" (SET NULL,
 * never CASCADE). Canonical home of this counter; goals/api re-exports it.
 */
export async function countTasksForGoal(goalId: string): Promise<number> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { count, error } = await client
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("goal_id", goalId)
      .eq("user_id", userId);

    if (error) {
      throw toTaskError(error);
    }

    return count ?? 0;
  } catch (error) {
    throw toTaskError(error);
  }
}
