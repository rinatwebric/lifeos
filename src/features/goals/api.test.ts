import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import { calculateGoalProgress } from "@/lib/progress";
import type { GoalsRow, MilestonesRow } from "@/types/database";

import {
  countTasksForGoal,
  createGoal,
  createMilestone,
  getGoal,
  listAllMilestones,
  listGoals,
  listMilestones,
  reorderMilestones,
  updateGoal,
} from "./api";
import { GoalServiceError } from "./errors";
import { goals } from "./queryKeys";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const GOAL_ROW: GoalsRow = {
  id: "goal-1",
  user_id: "u1",
  title: "Learn piano",
  description: null,
  category: "personal_development",
  priority: "medium",
  status: "active",
  start_date: "2026-11-01",
  target_date: "2026-12-01",
  progress: 20,
  progress_mode: "manual",
  completed_at: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
};

const MILESTONE_ROWS: MilestonesRow[] = [
  {
    id: "m1",
    user_id: "u1",
    goal_id: "goal-1",
    title: "Scales",
    description: null,
    position: 0,
    status: "completed",
    target_date: null,
    completed_at: "2026-11-02T00:00:00.000Z",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-02T00:00:00.000Z",
  },
  {
    id: "m2",
    user_id: "u1",
    goal_id: "goal-1",
    title: "Chords",
    description: null,
    position: 1,
    status: "pending",
    target_date: null,
    completed_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  },
];

interface BuilderMocks {
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  builder: Record<string, ReturnType<typeof vi.fn>>;
}

function mockBuilder(thenResult: unknown, singleResult?: unknown): BuilderMocks {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  const eq = vi.fn();
  const ilike = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();
  const limit = vi.fn();
  const single = vi.fn();

  Object.assign(builder, { eq, ilike, order, select, insert, update, limit, single });
  builder["delete"] = deleteFn;

  eq.mockReturnValue(builder);
  ilike.mockReturnValue(builder);
  order.mockReturnValue(builder);
  select.mockReturnValue(builder);
  insert.mockReturnValue(builder);
  update.mockReturnValue(builder);
  deleteFn.mockReturnValue(builder);
  limit.mockReturnValue(builder);
  single.mockResolvedValue(singleResult ?? thenResult);

  const withThen = Object.assign(builder, {
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(thenResult).then(onFulfilled, onRejected),
  });

  return {
    eq,
    ilike,
    order,
    select,
    insert,
    update,
    delete: deleteFn,
    limit,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("goals api", () => {
  it("lists goals for the JWT identity and maps rows to camelCase", async () => {
    const { builder, eq } = mockBuilder({ data: [GOAL_ROW], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listGoals();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "goal-1", title: "Learn piano", progress: 20 });
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("applies status/category/priority/search filters", async () => {
    const { builder, eq, ilike } = mockBuilder({ data: [], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await listGoals({ status: "active", category: "health", priority: "high", search: "run" });

    expect(eq).toHaveBeenCalledWith("status", "active");
    expect(eq).toHaveBeenCalledWith("category", "health");
    expect(eq).toHaveBeenCalledWith("priority", "high");
    expect(ilike).toHaveBeenCalledWith("title", "%run%");
  });

  it("gets a single goal and surfaces PGRST116 as not_found", async () => {
    const ok = mockBuilder({ data: null, error: null }, { data: GOAL_ROW, error: null });
    stubClient("u1", vi.fn().mockReturnValue(ok.builder));
    await expect(getGoal("goal-1")).resolves.toMatchObject({ id: "goal-1" });

    const missing = mockBuilder(
      { data: null, error: null },
      { data: null, error: { code: "PGRST116", message: "0 rows" } },
    );
    stubClient("u1", vi.fn().mockReturnValue(missing.builder));
    await expect(getGoal("missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("creates a goal with the JWT user_id and trims the title", async () => {
    const { builder, insert } = mockBuilder(
      { data: null, error: null },
      { data: GOAL_ROW, error: null },
    );
    stubClient("jwt-user-7", vi.fn().mockReturnValue(builder));

    await createGoal({
      title: "  Learn piano  ",
      description: null,
      category: "personal_development",
      priority: "medium",
      status: "active",
      startDate: "2026-11-01",
      targetDate: "2026-12-01",
      progress: 0,
      progressMode: "manual",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "jwt-user-7", title: "Learn piano" }),
    );
  });

  it("preserves the manual progress value when switching progress_mode", async () => {
    const { builder, update } = mockBuilder(
      { data: null, error: null },
      { data: { ...GOAL_ROW, progress_mode: "milestones", progress: 20 }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const updated = await updateGoal("goal-1", { progressMode: "milestones" });

    expect(update).toHaveBeenCalledOnce();
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ progress_mode: "milestones" });
    expect("progress" in payload).toBe(false);
    expect(updated.progress).toBe(20);
  });

  it("falls back to the manual value when milestones mode has 0 milestones", () => {
    expect(
      calculateGoalProgress({ progressMode: "milestones", progress: 33, milestones: [] }),
    ).toBe(33);
  });

  it("lists milestones ordered by position, created_at, id", async () => {
    const { builder, order } = mockBuilder({ data: MILESTONE_ROWS, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listMilestones("goal-1");

    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(order).toHaveBeenNthCalledWith(1, "position", { ascending: true });
    expect(order).toHaveBeenNthCalledWith(2, "created_at", { ascending: true });
    expect(order).toHaveBeenNthCalledWith(3, "id", { ascending: true });
  });

  it("starts the first milestone at position 0", async () => {
    const { builder, insert } = mockBuilder(
      { data: [], error: null },
      { data: { ...MILESTONE_ROWS[0], position: 0 }, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await createMilestone({ goalId: "goal-1", title: "First" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }));
  });

  it("rewrites positions as a dense sequence without gaps or collisions", async () => {
    const reordered: MilestonesRow[] = [
      { ...MILESTONE_ROWS[1], position: 0 },
      { ...MILESTONE_ROWS[0], position: 1 },
    ];
    const { builder, update } = mockBuilder({ data: reordered, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await reorderMilestones("goal-1", ["m2", "m1"]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { position: 0 });
    expect(update).toHaveBeenNthCalledWith(2, { position: 1 });
    expect(result.map((m) => m.position)).toEqual([0, 1]);
    await expect(reorderMilestones("goal-1", ["m1", "m1"])).rejects.toBeInstanceOf(
      GoalServiceError,
    );
  });

  it("counts tasks for the delete dialog", async () => {
    const { builder } = mockBuilder({ count: 3, error: null, data: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(countTasksForGoal("goal-1")).resolves.toBe(3);
    expect(fromEntry).toHaveBeenCalledWith("tasks");
  });

  it("fetches all milestone slices in one query (no N+1)", async () => {
    const { builder, eq, select } = mockBuilder({
      data: [
        { id: "m1", goal_id: "goal-1", title: "Scales", status: "completed" },
        { id: "m2", goal_id: "goal-1", title: "Chords", status: "pending" },
      ],
      error: null,
    });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listAllMilestones();

    expect(select).toHaveBeenCalledWith("id,goal_id,title,status");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(result).toEqual([
      { id: "m1", goalId: "goal-1", title: "Scales", status: "completed" },
      { id: "m2", goalId: "goal-1", title: "Chords", status: "pending" },
    ]);
  });

  it("builds scoped query keys", () => {
    expect(goals.all).toEqual(["goals"]);
    expect(goals.list({ status: "active" })[2]).toMatchObject({ status: "active" });
    expect(goals.detail("g1")).toEqual(["goals", "detail", "g1"]);
    expect(goals.milestones("g1")).toEqual(["goals", "milestones", "g1"]);
  });
});
