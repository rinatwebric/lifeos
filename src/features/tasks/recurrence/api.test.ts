import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import { expandRecurrenceDates } from "@/lib/recurrence";
import type { RecurrenceRulesRow, TasksRow } from "@/types/database";

import { rescheduleTask, updateTask } from "../api";
import {
  createRecurrenceRule,
  createRecurringTask,
  deactivateRecurrenceRule,
  deleteRecurrenceRule,
  listRecurrenceRules,
  topUpAllActiveRecurrenceInstances,
  topUpRecurrenceInstances,
  updateRecurrenceRule,
} from "./api";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const RULE_ROW: RecurrenceRulesRow = {
  id: "r1",
  user_id: "u1",
  frequency: "daily",
  weekdays: [],
  interval_value: 1,
  start_date: "2026-11-04",
  end_date: null,
  is_active: true,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
};

const TASK_ROW: TasksRow = {
  id: "t1",
  user_id: "u1",
  goal_id: null,
  milestone_id: null,
  title: "Morning run",
  description: null,
  priority: "medium",
  status: "todo",
  due_date: "2026-11-04",
  scheduled_start: null,
  scheduled_end: null,
  estimated_duration_minutes: null,
  completed_at: null,
  recurrence_rule_id: "r1",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
};

interface BuilderMocks {
  builder: Record<string, ReturnType<typeof vi.fn>>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

function mockBuilder(thenResult: unknown, singleResult?: unknown): BuilderMocks {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  const eq = vi.fn();
  const inFn = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  const select = vi.fn();
  const insert = vi.fn();
  const upsert = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();
  const single = vi.fn();

  Object.assign(builder, { eq, in: inFn, order, limit, select, insert, upsert, update, single });
  builder["delete"] = deleteFn;

  eq.mockReturnValue(builder);
  inFn.mockReturnValue(builder);
  order.mockReturnValue(builder);
  limit.mockReturnValue(builder);
  select.mockReturnValue(builder);
  insert.mockReturnValue(builder);
  upsert.mockReturnValue(builder);
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
    builder: withThen,
    eq,
    in: inFn,
    order,
    limit,
    select,
    insert,
    upsert,
    update,
    delete: deleteFn,
    single,
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
  vi.useRealTimers();
});

describe("recurrence expansion boundaries", () => {
  it("stops at end_date", () => {
    const dates = expandRecurrenceDates(
      {
        frequency: "daily",
        weekdays: [],
        intervalValue: 1,
        startDate: "2026-11-04",
        endDate: "2026-11-05",
      },
      "2026-11-04",
      10,
    );

    expect(dates).toEqual(["2026-11-04", "2026-11-05"]);
  });

  it("includes February 29 on a leap year", () => {
    const dates = expandRecurrenceDates(
      {
        frequency: "daily",
        weekdays: [],
        intervalValue: 1,
        startDate: "2024-02-27",
        endDate: null,
      },
      "2024-02-27",
      5,
    );

    expect(dates).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
    ]);
  });

  it("returns no dates for an empty weekdays selection", () => {
    const dates = expandRecurrenceDates(
      {
        frequency: "weekdays",
        weekdays: [],
        intervalValue: 1,
        startDate: "2026-11-04",
        endDate: null,
      },
      "2026-11-04",
      7,
    );

    expect(dates).toEqual([]);
  });
});

describe("recurrence rules api", () => {
  it("lists rules mapped to camelCase", async () => {
    const rules = mockBuilder({ data: [RULE_ROW], error: null });
    stubClient("u1", vi.fn().mockReturnValue(rules.builder));

    const result = await listRecurrenceRules();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "r1",
      frequency: "daily",
      startDate: "2026-11-04",
      isActive: true,
    });
  });

  it("rejects a weekdays rule with an empty selection before writing", async () => {
    const rules = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn().mockReturnValue(rules.builder);
    stubClient("u1", fromEntry);

    await expect(
      createRecurrenceRule({ frequency: "weekdays", weekdays: [], startDate: "2026-11-04" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(rules.insert).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    const rules = mockBuilder({ data: null, error: null });
    stubClient("u1", vi.fn().mockReturnValue(rules.builder));

    await expect(
      createRecurrenceRule({
        frequency: "daily",
        startDate: "2026-11-10",
        endDate: "2026-11-04",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("creates a recurring task with an idempotent batch insert", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const rules = mockBuilder(
      { data: null, error: null },
      { data: { ...RULE_ROW, start_date: "2026-11-04" }, error: null },
    );
    const tasks = mockBuilder(
      { data: null, error: null },
      { data: null, error: null },
    );
    const inserted = [{ ...TASK_ROW }, { ...TASK_ROW, id: "t2", due_date: "2026-11-05" }];
    tasks.insert.mockReturnValue(
      Object.assign(tasks.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: inserted, error: null }).then(ok),
        }),
      }),
    );
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? rules.builder : tasks.builder,
    );
    stubClient("u1", fromEntry);

    const result = await createRecurringTask({
      task: {
        title: "Morning run",
        description: null,
        priority: "medium",
        status: "todo",
        dueDate: "2026-11-04",
        scheduledStart: null,
        scheduledEnd: null,
        estimatedDurationMinutes: null,
        goalId: null,
        milestoneId: null,
      },
      recurrence: { frequency: "daily" },
    });

    expect(result.rule).toMatchObject({ id: "r1" });
    expect(tasks.insert).toHaveBeenCalledOnce();
    const [payloads] = tasks.insert.mock.calls[0] as [Array<{ due_date: string }>];
    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads[0]).toMatchObject({ due_date: "2026-11-04", recurrence_rule_id: "r1" });
  });

  it("inserts only future dates, skipping the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T00:00:00.000Z"));

    const rules = mockBuilder(
      { data: null, error: null },
      { data: { ...RULE_ROW, start_date: "2026-11-01" }, error: null },
    );
    const tasks = mockBuilder({ data: [], error: null }, { data: [], error: null });
    let seenPayloads: Array<{ due_date: string }> = [];
    tasks.insert.mockImplementation((payloads: Array<{ due_date: string }>) => {
      seenPayloads = payloads;
      return Object.assign(tasks.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(ok),
        }),
      });
    });
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? rules.builder : tasks.builder,
    );
    stubClient("u1", fromEntry);

    await createRecurringTask({
      task: {
        title: "Past start",
        description: null,
        priority: "low",
        status: "todo",
        dueDate: "2026-11-01",
        scheduledStart: null,
        scheduledEnd: null,
        estimatedDurationMinutes: null,
        goalId: null,
        milestoneId: null,
      },
      recurrence: { frequency: "daily" },
    });

    expect(seenPayloads.length).toBeGreaterThan(0);
    for (const payload of seenPayloads) {
      expect(payload.due_date >= "2026-11-10").toBe(true);
    }
  });

  it("top-up inserts only missing dates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: RULE_ROW, error: null },
    );
    const existingBuilder = mockBuilder({ data: [{ due_date: "2026-11-04" }], error: null });
    const templateBuilder = mockBuilder({ data: [TASK_ROW], error: null });
    const insertBuilder = mockBuilder({ data: [], error: null });
    let insertPayloads: Array<{ due_date: string }> | null = null;
    insertBuilder.insert.mockImplementation((payloads: Array<{ due_date: string }>) => {
      insertPayloads = payloads;
      return Object.assign(insertBuilder.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: payloads.slice(0, 1), error: null }).then(ok),
        }),
      });
    });

    let callIndex = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return ruleBuilder.builder;
      }
      callIndex += 1;
      if (callIndex === 1) {
        return existingBuilder.builder;
      }
      if (callIndex === 2) {
        return templateBuilder.builder;
      }
      return insertBuilder.builder;
    });
    stubClient("u1", fromEntry);

    const created = await topUpRecurrenceInstances("r1", 3);

    expect(created).toBe(1);
    expect(insertPayloads).not.toBeNull();
    expect(
      (insertPayloads as unknown as Array<{ due_date: string }>).map((p) => p.due_date),
    ).toEqual(["2026-11-05", "2026-11-06"]);
  });

  it("top-up absorbs a concurrent-device unique violation row by row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: RULE_ROW, error: null },
    );
    const existingBuilder = mockBuilder({ data: [], error: null });
    const templateBuilder = mockBuilder({ data: [TASK_ROW], error: null });
    const batchFailBuilder = mockBuilder({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_tasks_recurrence_instance"',
      },
    });
    const perRowBuilder = mockBuilder({ data: [TASK_ROW], error: null });

    let tasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return ruleBuilder.builder;
      }
      tasksCalls += 1;
      if (tasksCalls === 1) {
        return existingBuilder.builder;
      }
      if (tasksCalls === 2) {
        return templateBuilder.builder;
      }
      if (tasksCalls === 3) {
        return batchFailBuilder.builder;
      }
      return perRowBuilder.builder;
    });
    stubClient("u1", fromEntry);

    const created = await topUpRecurrenceInstances("r1", 2);

    // Two missing dates retried one by one after the racing batch failed.
    expect(created).toBe(2);
    expect(batchFailBuilder.insert).toHaveBeenCalledOnce();
    expect(perRowBuilder.insert).toHaveBeenCalledTimes(2);
  });

  it("second top-up creates 0 rows when already up to date (idempotent)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: RULE_ROW, error: null },
    );
    const existingBuilder = mockBuilder({
      data: [{ due_date: "2026-11-04" }, { due_date: "2026-11-05" }],
      error: null,
    });
    const insertBuilder = mockBuilder({ data: [], error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? ruleBuilder.builder : existingBuilder.builder,
    );
    stubClient("u1", fromEntry);
    void insertBuilder;

    const created = await topUpRecurrenceInstances("r1", 2);

    expect(created).toBe(0);
  });

  it("top-up is a no-op for inactive rules", async () => {
    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: { ...RULE_ROW, is_active: false }, error: null },
    );
    const tasksBuilder = mockBuilder({ data: [], error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? ruleBuilder.builder : tasksBuilder.builder,
    );
    stubClient("u1", fromEntry);

    await expect(topUpRecurrenceInstances("r1")).resolves.toBe(0);
    expect(tasksBuilder.insert).not.toHaveBeenCalled();
  });

  it("editing an instance detaches it without touching the rule", async () => {
    const current = { ...TASK_ROW, recurrence_rule_id: "r1" };
    const tasksBuilder = mockBuilder(
      { data: null, error: null },
      { data: { ...current, title: "Renamed", recurrence_rule_id: null }, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(tasksBuilder.builder);
    stubClient("u1", fromEntry);

    const result = await updateTask("t1", { title: "Renamed" });

    expect(tasksBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed", recurrence_rule_id: null }),
    );
    expect(fromEntry).not.toHaveBeenCalledWith("recurrence_rules");
    expect(result.recurrenceRuleId).toBeNull();
  });

  it("rescheduling an instance detaches it from the series", async () => {
    const tasksBuilder = mockBuilder(
      { data: null, error: null },
      {
        data: { ...TASK_ROW, due_date: "2026-12-01", recurrence_rule_id: null },
        error: null,
      },
    );
    stubClient("u1", vi.fn().mockReturnValue(tasksBuilder.builder));

    const result = await rescheduleTask("t1", "2026-12-01");

    expect(tasksBuilder.update).toHaveBeenCalledWith({
      due_date: "2026-12-01",
      recurrence_rule_id: null,
    });
    expect(result.recurrenceRuleId).toBeNull();
  });

  it("deleting a rule keeps history (no task deletes, SET NULL is the FK)", async () => {
    const rulesBuilder = mockBuilder({ data: null, error: null });
    const tasksBuilder = mockBuilder({ data: [], error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? rulesBuilder.builder : tasksBuilder.builder,
    );
    stubClient("u1", fromEntry);

    await deleteRecurrenceRule("r1");

    expect(rulesBuilder.delete).toHaveBeenCalledOnce();
    expect(tasksBuilder.delete).not.toHaveBeenCalled();
  });

  it("updating a rule tops up only future missing dates, never rewrites instances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const updatedRule = { ...RULE_ROW, interval_value: 1 };
    const ruleUpdate = mockBuilder(
      { data: null, error: null },
      { data: updatedRule, error: null },
    );
    const ruleFetch = mockBuilder(
      { data: null, error: null },
      { data: updatedRule, error: null },
    );
    const existing = mockBuilder({ data: [{ due_date: "2026-11-04" }], error: null });
    const template = mockBuilder({ data: [TASK_ROW], error: null });
    const inserter = mockBuilder({ data: [], error: null });
    inserter.insert.mockImplementation((payloads: unknown) => {
      const rows = payloads as TasksRow[];
      return Object.assign(inserter.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(ok),
        }),
      });
    });

    const builders = [ruleUpdate.builder, ruleFetch.builder, existing.builder];
    let tasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return builders.shift() ?? ruleFetch.builder;
      }
      tasksCalls += 1;
      if (tasksCalls === 1) {
        return existing.builder;
      }
      if (tasksCalls === 2) {
        return template.builder;
      }
      return inserter.builder;
    });
    stubClient("u1", fromEntry);

    const result = await updateRecurrenceRule("r1", { intervalValue: 1 });

    expect(result).toMatchObject({ id: "r1" });
    expect(ruleUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ interval_value: 1 }),
    );
    const [payloads] = inserter.insert.mock.calls[0] as [Array<{ due_date: string }>];
    expect(payloads.map((p) => p.due_date)).not.toContain("2026-11-04");
  });

  it("deactivating a rule flips is_active without deleting instances", async () => {
    const rulesBuilder = mockBuilder(
      { data: null, error: null },
      { data: { ...RULE_ROW, is_active: false }, error: null },
    );
    const tasksBuilder = mockBuilder({ data: [], error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "recurrence_rules" ? rulesBuilder.builder : tasksBuilder.builder,
    );
    stubClient("u1", fromEntry);

    const result = await deactivateRecurrenceRule("r1");

    expect(rulesBuilder.update).toHaveBeenCalledWith({ is_active: false });
    expect(result.isActive).toBe(false);
    expect(tasksBuilder.delete).not.toHaveBeenCalled();
  });

  it("login top-up skips inactive rules and totals the rest (batched)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const activeRule = { ...RULE_ROW, id: "r-active" };
    const inactiveRule = { ...RULE_ROW, id: "r-off", is_active: false };
    const listBuilder = mockBuilder({ data: [activeRule, inactiveRule], error: null });
    const existing = mockBuilder({ data: [], error: null });
    const template = mockBuilder({
      data: [{ ...TASK_ROW, recurrence_rule_id: "r-active" }],
      error: null,
    });
    const inserter = mockBuilder({ data: [], error: null });
    inserter.insert.mockImplementation((payloads: unknown) => {
      const rows = payloads as TasksRow[];
      return Object.assign(inserter.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows.slice(0, 2), error: null }).then(ok),
        }),
      });
    });

    let batchedTasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return listBuilder.builder;
      }
      batchedTasksCalls += 1;
      if (batchedTasksCalls === 1) {
        return existing.builder;
      }
      if (batchedTasksCalls === 2) {
        return template.builder;
      }
      return inserter.builder;
    });
    stubClient("u1", fromEntry);

    const total = await topUpAllActiveRecurrenceInstances({ horizonDays: 2 });

    expect(total).toBe(2);
    // One existing query via .in, one template query via .in (batched, not per-rule).
    expect(existing.in).toHaveBeenCalledWith("recurrence_rule_id", ["r-active"]);
    expect(template.in).toHaveBeenCalledWith("recurrence_rule_id", ["r-active"]);
  });

  it("uses the profile time zone: 00:30 UTC+6 never creates yesterday", async () => {
    // 2026-11-04 00:30 in Asia/Bishkek (UTC+6) is still 2026-11-03 18:30 UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T18:30:00.000Z"));

    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: { ...RULE_ROW, start_date: "2026-11-01" }, error: null },
    );
    const existingBuilder = mockBuilder({ data: [], error: null });
    const templateBuilder = mockBuilder({
      data: [{ ...TASK_ROW, due_date: "2026-11-04" }],
      error: null,
    });
    const insertBuilder = mockBuilder({ data: [], error: null });
    let insertPayloads: Array<{ due_date: string }> | null = null;
    insertBuilder.insert.mockImplementation((payloads: Array<{ due_date: string }>) => {
      insertPayloads = payloads;
      return Object.assign(insertBuilder.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: payloads.slice(0, 2), error: null }).then(ok),
        }),
      });
    });

    let tasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return ruleBuilder.builder;
      }
      tasksCalls += 1;
      if (tasksCalls === 1) {
        return existingBuilder.builder;
      }
      if (tasksCalls === 2) {
        return templateBuilder.builder;
      }
      return insertBuilder.builder;
    });
    stubClient("u1", fromEntry);

    await topUpRecurrenceInstances("r1", { horizonDays: 2, timeZone: "Asia/Bishkek" });

    expect(insertPayloads).not.toBeNull();
    const dates = (insertPayloads as unknown as Array<{ due_date: string }>).map(
      (p) => p.due_date,
    );
    // Local today is 2026-11-04, so the window is [11-04, 11-06), never 11-03.
    expect(dates).toEqual(["2026-11-04", "2026-11-05"]);
    expect(dates).not.toContain("2026-11-03");
  });

  it("shifts scheduled times by whole days, preserving duration (D -> D+7)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const weeklyRule = {
      ...RULE_ROW,
      frequency: "daily" as const,
      interval_value: 7,
      start_date: "2026-11-04",
    };
    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: weeklyRule, error: null },
    );
    const existingBuilder = mockBuilder({ data: [{ due_date: "2026-11-04" }], error: null });
    const templateBuilder = mockBuilder({
      data: [
        {
          ...TASK_ROW,
          due_date: "2026-11-04",
          scheduled_start: "2026-11-04T09:00:00.000Z",
          scheduled_end: "2026-11-04T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const insertBuilder = mockBuilder({ data: [], error: null });
    let insertPayloads: Array<{
      due_date: string;
      scheduled_start: string | null;
      scheduled_end: string | null;
    }> | null = null;
    insertBuilder.insert.mockImplementation(
      (
        payloads: Array<{
          due_date: string;
          scheduled_start: string | null;
          scheduled_end: string | null;
        }>,
      ) => {
        insertPayloads = payloads;
        return Object.assign(insertBuilder.builder, {
          select: vi.fn().mockReturnValue({
            then: (ok: (v: unknown) => unknown) =>
              Promise.resolve({ data: payloads, error: null }).then(ok),
          }),
        });
      },
    );

    let tasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return ruleBuilder.builder;
      }
      tasksCalls += 1;
      if (tasksCalls === 1) {
        return existingBuilder.builder;
      }
      if (tasksCalls === 2) {
        return templateBuilder.builder;
      }
      return insertBuilder.builder;
    });
    stubClient("u1", fromEntry);

    await topUpRecurrenceInstances("r1", { horizonDays: 8 });

    expect(insertPayloads).not.toBeNull();
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads?.[0]).toMatchObject({
      due_date: "2026-11-11",
      scheduled_start: "2026-11-11T09:00:00.000Z",
      scheduled_end: "2026-11-11T10:00:00.000Z",
    });
  });

  it("recreates missing dates after the earliest instance was deleted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const ruleBuilder = mockBuilder(
      { data: null, error: null },
      { data: RULE_ROW, error: null },
    );
    // 2026-11-04 was deleted; only 2026-11-05 survives.
    const existingBuilder = mockBuilder({ data: [{ due_date: "2026-11-05" }], error: null });
    // Latest-created survivor anchors the series (created_at desc).
    const templateBuilder = mockBuilder({
      data: [{ ...TASK_ROW, due_date: "2026-11-05", created_at: "2026-11-02T00:00:00.000Z" }],
      error: null,
    });
    const insertBuilder = mockBuilder({ data: [], error: null });
    let insertPayloads: Array<{ due_date: string }> | null = null;
    insertBuilder.insert.mockImplementation((payloads: Array<{ due_date: string }>) => {
      insertPayloads = payloads;
      return Object.assign(insertBuilder.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: payloads, error: null }).then(ok),
        }),
      });
    });

    let tasksCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return ruleBuilder.builder;
      }
      tasksCalls += 1;
      if (tasksCalls === 1) {
        return existingBuilder.builder;
      }
      if (tasksCalls === 2) {
        return templateBuilder.builder;
      }
      return insertBuilder.builder;
    });
    stubClient("u1", fromEntry);

    await topUpRecurrenceInstances("r1", { horizonDays: 3 });

    expect(templateBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(insertPayloads).not.toBeNull();
    const dates = (insertPayloads as unknown as Array<{ due_date: string }>).map(
      (p) => p.due_date,
    );
    // 11-04 is recreated even though the anchor template is dated 11-05.
    expect(dates).toEqual(["2026-11-04", "2026-11-06"]);
  });

  it("tops up all active rules with a constant number of queries (batched .in)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));

    const ruleA = { ...RULE_ROW, id: "r-a", start_date: "2026-11-04" };
    const ruleB = { ...RULE_ROW, id: "r-b", start_date: "2026-11-04" };
    const listBuilder = mockBuilder({ data: [ruleA, ruleB], error: null });
    const existingBuilder = mockBuilder({ data: [], error: null });
    const templateBuilder = mockBuilder({
      data: [
        { ...TASK_ROW, id: "t-a", recurrence_rule_id: "r-a", due_date: "2026-11-04" },
        { ...TASK_ROW, id: "t-b", recurrence_rule_id: "r-b", due_date: "2026-11-04" },
      ],
      error: null,
    });
    const insertBuilder = mockBuilder({ data: [], error: null });
    insertBuilder.insert.mockImplementation((payloads: unknown) => {
      const rows = payloads as TasksRow[];
      return Object.assign(insertBuilder.builder, {
        select: vi.fn().mockReturnValue({
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(ok),
        }),
      });
    });

    let batchedAllCalls = 0;
    const fromEntry = vi.fn((table: string) => {
      if (table === "recurrence_rules") {
        return listBuilder.builder;
      }
      batchedAllCalls += 1;
      if (batchedAllCalls === 1) {
        return existingBuilder.builder;
      }
      if (batchedAllCalls === 2) {
        return templateBuilder.builder;
      }
      return insertBuilder.builder;
    });
    stubClient("u1", fromEntry);

    const total = await topUpAllActiveRecurrenceInstances({ horizonDays: 2 });

    // 2 rules x 2 days = 4 missing dates, one batch insert.
    expect(total).toBe(4);
    // Constant cost: rules list + existing (.in) + templates (.in) + batch insert.
    expect(fromEntry).toHaveBeenCalledTimes(4);
    expect(existingBuilder.in).toHaveBeenCalledWith("recurrence_rule_id", ["r-a", "r-b"]);
    expect(templateBuilder.in).toHaveBeenCalledWith("recurrence_rule_id", ["r-a", "r-b"]);
    expect(insertBuilder.insert).toHaveBeenCalledOnce();
  });
});
