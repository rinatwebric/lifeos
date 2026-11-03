import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { TasksRow } from "@/types/database";

import {
  countTasksForGoal,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  rescheduleTask,
  setTaskStatus,
  TASK_LIST_LIMIT,
  updateTask,
} from "./api";
import { TaskServiceError } from "./errors";
import { tasks } from "./queryKeys";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const TASK_ROW: TasksRow = {
  id: "t1",
  user_id: "u1",
  goal_id: "g1",
  milestone_id: null,
  title: "Write report",
  description: null,
  priority: "medium",
  status: "todo",
  due_date: "2026-11-10",
  scheduled_start: null,
  scheduled_end: null,
  estimated_duration_minutes: null,
  completed_at: null,
  recurrence_rule_id: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
};

function taskRow(overrides: Partial<TasksRow> & { id: string }): TasksRow {
  return { ...TASK_ROW, ...overrides };
}

interface BuilderMocks {
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  builder: Record<string, ReturnType<typeof vi.fn>>;
}

function mockBuilder(thenResult: unknown, singleResult?: unknown): BuilderMocks {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  const eq = vi.fn();
  const inFn = vi.fn();
  const ilike = vi.fn();
  const gte = vi.fn();
  const lte = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();
  const single = vi.fn();

  Object.assign(builder, { eq, in: inFn, ilike, gte, lte, order, limit, select, insert, update, single });
  builder["delete"] = deleteFn;

  eq.mockReturnValue(builder);
  inFn.mockReturnValue(builder);
  ilike.mockReturnValue(builder);
  gte.mockReturnValue(builder);
  lte.mockReturnValue(builder);
  order.mockReturnValue(builder);
  limit.mockReturnValue(builder);
  select.mockReturnValue(builder);
  insert.mockReturnValue(builder);
  update.mockReturnValue(builder);
  deleteFn.mockReturnValue(builder);
  single.mockResolvedValue(singleResult ?? thenResult);

  const withThen = Object.assign(builder, {
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(thenResult).then(onFulfilled, onRejected),
  });

  return {
    eq,
    in: inFn,
    ilike,
    gte,
    lte,
    order,
    limit,
    select,
    insert,
    update,
    delete: deleteFn,
    single,
    builder: withThen,
  };
}

function stubClient(authUserId: string | null, fromEntry: ReturnType<typeof vi.fn>) {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: authUserId ? { user: { id: authUserId } } : null },
    error: null,
  });
  mockedGetClient.mockReturnValue({
    auth: { getSession },
    from: fromEntry,
  } as unknown as SupabaseClient);
}

function stubSingleTable(thenResult: unknown, singleResult?: unknown) {
  const { builder } = mockBuilder(thenResult, singleResult);
  stubClient("u1", vi.fn().mockReturnValue(builder));
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tasks api", () => {
  it("lists tasks for the JWT identity and maps rows to camelCase", async () => {
    const { builder, eq } = mockBuilder({ data: [TASK_ROW], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listTasks();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "t1",
      goalId: "g1",
      title: "Write report",
      dueDate: "2026-11-10",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("sorts by due date asc with nulls last, then priority desc, then created desc", async () => {
    const rows = [
      taskRow({ id: "late-low", due_date: "2026-11-20", priority: "low" }),
      taskRow({ id: "null-critical", due_date: null, priority: "critical" }),
      taskRow({ id: "early-low", due_date: "2026-11-05", priority: "low" }),
      taskRow({ id: "early-critical", due_date: "2026-11-05", priority: "critical" }),
      taskRow({
        id: "old",
        due_date: "2026-11-05",
        priority: "critical",
        created_at: "2026-11-01T00:00:00.000Z",
      }),
      taskRow({
        id: "new",
        due_date: "2026-11-05",
        priority: "critical",
        created_at: "2026-11-03T00:00:00.000Z",
      }),
    ];
    const { builder, order } = mockBuilder({ data: rows, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listTasks();

    expect(result.map((task) => task.id)).toEqual([
      "new",
      "early-critical",
      "old",
      "early-low",
      "late-low",
      "null-critical",
    ]);
    expect(order).toHaveBeenCalledWith("due_date", { ascending: true, nullsFirst: false });
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("ranks priority by explicit map, not alphabetically", async () => {
    const rows = [
      taskRow({ id: "low", due_date: "2026-11-05", priority: "low" }),
      taskRow({ id: "medium", due_date: "2026-11-05", priority: "medium" }),
      taskRow({ id: "high", due_date: "2026-11-05", priority: "high" }),
      taskRow({ id: "critical", due_date: "2026-11-05", priority: "critical" }),
    ];
    stubSingleTable({ data: rows, error: null });

    const result = await listTasks();

    // Alphabetical asc would be critical, high, low, medium — low must NOT
    // come before medium.
    expect(result.map((task) => task.id)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("applies status/priority/goal/milestone/search/date-range filters", async () => {
    const { builder, eq, ilike, gte, lte } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listTasks({
      status: "in_progress",
      priority: "high",
      goalId: "g1",
      milestoneId: "m1",
      search: "report",
      dueAfter: "2026-11-01",
      dueBefore: "2026-11-30",
    });

    expect(eq).toHaveBeenCalledWith("status", "in_progress");
    expect(eq).toHaveBeenCalledWith("priority", "high");
    expect(eq).toHaveBeenCalledWith("goal_id", "g1");
    expect(eq).toHaveBeenCalledWith("milestone_id", "m1");
    expect(ilike).toHaveBeenCalledWith("title", "%report%");
    expect(gte).toHaveBeenCalledWith("due_date", "2026-11-01");
    expect(lte).toHaveBeenCalledWith("due_date", "2026-11-30");
  });

  it("filters by multiple statuses with .in", async () => {
    const { builder, in: inFn } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listTasks({ statuses: ["todo", "in_progress"] });

    expect(inFn).toHaveBeenCalledWith("status", ["todo", "in_progress"]);
  });

  it("skips .in for an empty statuses array", async () => {
    const { builder, in: inFn } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listTasks({ statuses: [] });

    expect(inFn).not.toHaveBeenCalled();
  });

  it("trims the search and skips ilike for a blank query", async () => {
    const { builder, ilike } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listTasks({ search: "  padded  " });
    expect(ilike).toHaveBeenCalledWith("title", "%padded%");

    vi.clearAllMocks();
    const blank = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(blank.builder));

    await listTasks({ search: "   " });
    expect(blank.ilike).not.toHaveBeenCalled();
  });

  it("caps the list query at TASK_LIST_LIMIT rows", async () => {
    expect(TASK_LIST_LIMIT).toBe(500);
    const { builder, limit } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listTasks();

    expect(limit).toHaveBeenCalledWith(TASK_LIST_LIMIT);
  });

  it("rejects a milestone without a goal on create", async () => {
    const { builder, insert } = mockBuilder(
      { data: null, error: null },
      { data: TASK_ROW, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(
      createTask({
        title: "Step",
        priority: "medium",
        status: "todo",
        goalId: null,
        milestoneId: "123e4567-e89b-12d3-a456-426614174001",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    await expect(
      createTask({
        title: "Step",
        priority: "medium",
        status: "todo",
        milestoneId: "123e4567-e89b-12d3-a456-426614174001",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    expect(insert).not.toHaveBeenCalled();
    expect(fromEntry).not.toHaveBeenCalledWith("milestones");
  });

  it("clears the milestone link when the goal is unlinked on update", async () => {
    const current = { ...TASK_ROW, goal_id: "g1", milestone_id: "m1" };
    const { builder, update, single } = mockBuilder(
      { data: null, error: null },
      { data: { ...current, goal_id: null, milestone_id: null }, error: null },
    );
    single.mockResolvedValueOnce({ data: current, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await updateTask("t1", { goalId: null });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: null, milestone_id: null }),
    );
    expect(fromEntry).not.toHaveBeenCalledWith("milestones");
    expect(result.milestoneId).toBeNull();
  });

  it("clears a milestone added to a goal-less task on update", async () => {
    const current = { ...TASK_ROW, goal_id: null, milestone_id: null };
    const { builder, update, single } = mockBuilder(
      { data: null, error: null },
      { data: current, error: null },
    );
    single.mockResolvedValueOnce({ data: current, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await updateTask("t1", { milestoneId: "m2" });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ milestone_id: null }));
    expect(fromEntry).not.toHaveBeenCalledWith("milestones");
  });

  it("gets a single task and surfaces PGRST116 as not_found", async () => {
    const ok = mockBuilder(
      { data: null, error: null },
      { data: TASK_ROW, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(ok.builder));
    await expect(getTask("t1")).resolves.toMatchObject({ id: "t1" });

    const missing = mockBuilder(
      { data: null, error: null },
      { data: null, error: { code: "PGRST116", message: "0 rows" } },
    );
    stubClient("u1", vi.fn().mockReturnValue(missing.builder));
    await expect(getTask("missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires a session for every call", async () => {
    stubSingleTable({ data: [], error: null });
    stubClient(null, vi.fn());

    await expect(listTasks()).rejects.toMatchObject({ code: "forbidden" });
    await expect(getTask("t1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("creates a task with the JWT user_id and trims the title", async () => {
    const { builder, insert } = mockBuilder(
      { data: null, error: null },
      { data: TASK_ROW, error: null },
    );
    stubClient("jwt-user-7", vi.fn().mockReturnValue(builder));

    await createTask({ title: "  Write report  ", priority: "medium", status: "todo" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "jwt-user-7",
        title: "Write report",
        completed_at: null,
        recurrence_rule_id: null,
      }),
    );
  });

  it("stamps completed_at when a task is created as completed", async () => {
    const { builder, insert } = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, status: "completed" }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await createTask({ title: "Done", priority: "low", status: "completed" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", completed_at: expect.any(String) }),
    );
  });

  it("allows a milestone that belongs to the selected goal", async () => {
    const goalId = "123e4567-e89b-12d3-a456-426614174000";
    const milestoneId = "123e4567-e89b-12d3-a456-426614174001";
    const milestone = mockBuilder(
      { data: null, error: null },
      { data: { goal_id: goalId }, error: null },
    );
    const task = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, goal_id: goalId, milestone_id: milestoneId }, error: null },
    );
    const fromEntry = vi.fn((table: string) =>
      table === "milestones" ? milestone.builder : task.builder,
    );
    stubClient("u1", fromEntry);

    const created = await createTask({
      title: "Step",
      priority: "medium",
      status: "todo",
      goalId,
      milestoneId,
    });

    expect(created.milestoneId).toBe(milestoneId);
    expect(task.insert).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: goalId, milestone_id: milestoneId }),
    );
  });

  it("rejects a milestone from another goal with a validation error", async () => {
    const milestone = mockBuilder(
      { data: null, error: null },
      { data: { goal_id: "other-goal" }, error: null },
    );
    const task = mockBuilder(
      { data: null, error: null },
      { data: TASK_ROW, error: null },
    );
    const fromEntry = vi.fn((table: string) =>
      table === "milestones" ? milestone.builder : task.builder,
    );
    stubClient("u1", fromEntry);

    const error = await createTask({
      title: "Step",
      priority: "medium",
      status: "todo",
      goalId: "123e4567-e89b-12d3-a456-426614174000",
      milestoneId: "123e4567-e89b-12d3-a456-426614174001",
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(TaskServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect(task.insert).not.toHaveBeenCalled();
  });

  it("skips the belonging check when only one side of the link is set", async () => {
    const { builder, insert } = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, goal_id: "g1", milestone_id: null }, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await createTask({
      title: "Goal only",
      priority: "medium",
      status: "todo",
      goalId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(fromEntry).toHaveBeenCalledWith("tasks");
    expect(fromEntry).not.toHaveBeenCalledWith("milestones");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: "123e4567-e89b-12d3-a456-426614174000" }),
    );
  });

  it("reports a missing milestone as validation, not a raw PostgREST error", async () => {
    const milestone = mockBuilder(
      { data: null, error: null },
      { data: null, error: { code: "PGRST116", message: "0 rows" } },
    );
    const task = mockBuilder({ data: null, error: null }, { data: TASK_ROW, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "milestones" ? milestone.builder : task.builder,
    );
    stubClient("u1", fromEntry);

    await expect(
      createTask({
        title: "Step",
        priority: "medium",
        status: "todo",
        goalId: "123e4567-e89b-12d3-a456-426614174000",
        milestoneId: "123e4567-e89b-12d3-a456-426614174001",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(task.insert).not.toHaveBeenCalled();
  });

  it("updates a task with a partial payload and trims the title", async () => {
    // No status/link change means a single `.single()` call (the update
    // itself) — no current-row prefetch.
    const updated = { ...TASK_ROW, title: "Renamed", priority: "high" as const };
    const { builder, update } = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await updateTask("t1", { title: "  Renamed  ", priority: "high" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed", priority: "high" }),
    );
    expect(result.title).toBe("Renamed");
  });

  it("stamps completed_at on complete and clears it on reopen", async () => {
    const open = { ...TASK_ROW, status: "todo" as const, completed_at: null };
    const done = { ...TASK_ROW, status: "completed" as const };

    const toCompleted = mockBuilder(
      { data: null, error: null },
      { data: { ...done, completed_at: "2026-11-04T00:00:00.000Z" }, error: null },
    );
    toCompleted.single.mockResolvedValueOnce({ data: open, error: null });
    stubClient("u1", vi.fn().mockReturnValue(toCompleted.builder));

    await updateTask("t1", { status: "completed" });
    expect(toCompleted.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", completed_at: expect.any(String) }),
    );

    const toReopen = mockBuilder(
      { data: null, error: null },
      { data: { ...open, status: "todo" as const }, error: null },
    );
    toReopen.single.mockResolvedValueOnce({
      data: { ...done, completed_at: "2026-11-04T00:00:00.000Z" },
      error: null,
    });
    stubClient("u1", vi.fn().mockReturnValue(toReopen.builder));

    await updateTask("t1", { status: "todo" });
    expect(toReopen.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "todo", completed_at: null }),
    );
  });

  it("keeps the original completed_at when the status did not change", async () => {
    const completed = { ...TASK_ROW, status: "completed" as const };
    const { builder, update, single } = mockBuilder(
      { data: null, error: null },
      { data: completed, error: null },
    );
    single.mockResolvedValueOnce({ data: completed, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await updateTask("t1", { status: "completed" });

    expect(update).toHaveBeenCalledOnce();
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ status: "completed" });
    expect("completed_at" in payload).toBe(false);
  });

  it("revalidates the effective pair when relinking a task to another goal", async () => {
    const current = { ...TASK_ROW, goal_id: "g1", milestone_id: "m1" };
    const milestone = mockBuilder(
      { data: null, error: null },
      { data: { goal_id: "g1" }, error: null },
    );
    const task = mockBuilder(
      { data: null, error: null },
      { data: current, error: null },
    );
    task.single.mockResolvedValueOnce({ data: current, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "milestones" ? milestone.builder : task.builder,
    );
    stubClient("u1", fromEntry);

    await expect(updateTask("t1", { goalId: "g2" })).rejects.toMatchObject({
      code: "validation",
    });
    expect(task.update).not.toHaveBeenCalled();
  });

  it("resolves the unchanged side from the current row on link edits", async () => {
    const current = { ...TASK_ROW, goal_id: "g1", milestone_id: "m1" };
    const milestone = mockBuilder(
      { data: null, error: null },
      { data: { goal_id: "g1" }, error: null },
    );
    const task = mockBuilder(
      { data: null, error: null },
      { data: { ...current, milestone_id: "m2" }, error: null },
    );
    task.single.mockResolvedValueOnce({ data: current, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "milestones" ? milestone.builder : task.builder,
    );
    stubClient("u1", fromEntry);

    await updateTask("t1", { milestoneId: "m2" });

    expect(task.update).toHaveBeenCalledWith(expect.objectContaining({ milestone_id: "m2" }));
  });

  it("returns the current task without writing on an empty patch", async () => {
    const { builder, update } = mockBuilder(
      { data: null, error: null },
      { data: TASK_ROW, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await updateTask("t1", {});

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "t1" });
  });

  it("setTaskStatus completes with a timestamp and reopens by clearing it", async () => {
    const completing = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, status: "completed" as const }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(completing.builder));

    await setTaskStatus("t1", "completed");
    expect(completing.update).toHaveBeenCalledWith({
      status: "completed",
      completed_at: expect.any(String),
    });

    const reopening = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, status: "todo" as const }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(reopening.builder));

    await setTaskStatus("t1", "todo");
    expect(reopening.update).toHaveBeenCalledWith({ status: "todo", completed_at: null });
  });

  it("reschedules the due date and clears it on null", async () => {
    const moved = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, due_date: "2026-12-01" }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(moved.builder));

    await rescheduleTask("t1", "2026-12-01");
    expect(moved.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: "2026-12-01", recurrence_rule_id: null }),
    );

    const cleared = mockBuilder(
      { data: null, error: null },
      { data: { ...TASK_ROW, due_date: null }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(cleared.builder));

    await rescheduleTask("t1", null);
    expect(cleared.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: null, recurrence_rule_id: null }),
    );
  });

  it("deletes a task scoped to the JWT identity", async () => {
    const { builder } = mockBuilder({ data: null, error: null }, { data: null, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await deleteTask("t1");

    expect(fromEntry).toHaveBeenCalledWith("tasks");
    expect(builder.delete).toHaveBeenCalledOnce();
    expect(builder.eq).toHaveBeenCalledWith("id", "t1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("counts tasks for the goal delete dialog", async () => {
    const { builder } = mockBuilder({ count: 3, error: null, data: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(countTasksForGoal("g1")).resolves.toBe(3);
    expect(fromEntry).toHaveBeenCalledWith("tasks");
  });

  it("maps CHECK, FK, RLS, datetime, network and unknown failures", async () => {
    const cases: Array<{ raw: unknown; code: string }> = [
      { raw: { code: "23514", message: "violates check constraint" }, code: "validation" },
      { raw: { code: "23503", message: "violates foreign key constraint" }, code: "conflict" },
      { raw: { code: "42501", message: "permission denied" }, code: "forbidden" },
      { raw: { code: "22007", message: "bad datetime" }, code: "validation" },
      { raw: new TypeError("Failed to fetch"), code: "network" },
      { raw: { message: "something odd" }, code: "unknown" },
    ];

    for (const { raw, code } of cases) {
      stubSingleTable({ data: null, error: raw });
      await expect(listTasks()).rejects.toMatchObject({ code });
    }
  });

  it("builds scoped query keys", () => {
    expect(tasks.all).toEqual(["tasks"]);
    expect(tasks.lists).toEqual(["tasks", "list"]);
    expect(tasks.list({ status: "todo" })[2]).toMatchObject({ status: "todo" });
    expect(tasks.detail("t1")).toEqual(["tasks", "detail", "t1"]);
  });
});
