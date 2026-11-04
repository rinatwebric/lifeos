import { describe, expect, it } from "vitest";

import { isTaskOverdue } from "@/lib/dates";
import { calculateCompletionRate } from "@/lib/progress";

import {
  TOOL_DEFINITIONS,
  TOOL_GOALS_LIMIT,
  TOOL_NAMES,
  TOOL_TASKS_LIMIT,
  TOOL_WEEKLY_WINDOW_DAYS,
  buildToolContext,
  type ToolContext,
  type ToolQueryResult,
  type UserScopedClient,
} from "./tools.ts";

type Row = Record<string, unknown>;

interface FakeDb {
  goals: Row[];
  tasks: Row[];
  preferences: Row | null;
  profile: Row | null;
}

interface CallRecord {
  table: string;
  selectCols: string;
  count?: string;
  head?: boolean;
  filters: Array<{ op: string; col: string }>;
}

type FilterOp = "eq" | "neq" | "gte" | "lte";

/** Chainable fake honoring eq/neq/gte/lte/order/limit/single + head-counts. */
class FakeQuery {
  private selectCols = "*";
  private countOpt?: string;
  private headOpt?: boolean;
  private filters: Array<{ op: FilterOp; col: string; val: string }> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb,
    private readonly calls: CallRecord[],
  ) {}

  select(cols: string, options?: { count?: string; head?: boolean }): this {
    this.selectCols = cols;
    this.countOpt = options?.count;
    this.headOpt = options?.head;
    return this;
  }

  eq(col: string, val: string): this {
    this.filters.push({ op: "eq", col, val });
    return this;
  }

  neq(col: string, val: string): this {
    this.filters.push({ op: "neq", col, val });
    return this;
  }

  gte(col: string, val: string): this {
    this.filters.push({ op: "gte", col, val });
    return this;
  }

  lte(col: string, val: string): this {
    this.filters.push({ op: "lte", col, val });
    return this;
  }

  order(col: string, options?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  single(): Promise<ToolQueryResult> {
    this.record();
    const rows = this.apply();
    if (rows.length === 0) {
      return Promise.resolve({ data: null, error: { message: "no rows" } });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = ToolQueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: ToolQueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.record();
    const rows = this.apply();
    const value: ToolQueryResult = this.headOpt
      ? { data: [], error: null, count: rows.length }
      : { data: rows, error: null, count: null };
    return Promise.resolve(value).then(onfulfilled, onrejected ?? undefined);
  }

  private record(): void {
    this.calls.push({
      table: this.table,
      selectCols: this.selectCols,
      count: this.countOpt,
      head: this.headOpt,
      filters: this.filters.map((f) => ({ op: f.op, col: f.col })),
    });
  }

  private baseRows(): Row[] {
    if (this.table === "goals") return [...this.db.goals];
    if (this.table === "tasks") return [...this.db.tasks];
    if (this.table === "user_preferences") {
      return this.db.preferences ? [{ ...this.db.preferences }] : [];
    }
    if (this.table === "profiles") {
      return this.db.profile ? [{ ...this.db.profile }] : [];
    }
    return [];
  }

  private apply(): Row[] {
    let rows = this.baseRows();
    for (const filter of this.filters) {
      if (filter.op === "eq") {
        rows = rows.filter((row) => row[filter.col] === filter.val);
      } else if (filter.op === "neq") {
        rows = rows.filter((row) => row[filter.col] !== filter.val);
      } else {
        rows = rows.filter((row) => {
          const value = row[filter.col];
          if (typeof value !== "string") return false;
          return filter.op === "gte" ? value >= filter.val : value <= filter.val;
        });
      }
    }
    if (this.orderCol !== null) {
      const col = this.orderCol;
      const asc = this.orderAsc;
      rows = [...rows].sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const sa = String(va);
        const sb = String(vb);
        if (sa === sb) return 0;
        return (sa < sb ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.limitN !== null && !this.headOpt) {
      rows = rows.slice(0, this.limitN);
    }
    return rows;
  }
}

function fakeClient(db: FakeDb, calls: CallRecord[] = []): UserScopedClient {
  return {
    from: (table: string) => new FakeQuery(table, db, calls) as unknown as ReturnType<UserScopedClient["from"]>,
  };
}

function goalRow(id: string, status: string, dueSuffix = "01"): Row {
  return {
    id,
    title: `Goal ${id}`,
    status,
    progress: 10,
    target_date: `2026-12-${dueSuffix}`,
    created_at: `2026-10-${dueSuffix}T00:00:00.000Z`,
  };
}

function taskRow(id: string, status: string, dueDate: string | null): Row {
  return { id, title: `Task ${id}`, status, due_date: dueDate, priority: "medium" };
}

const NOW = new Date("2026-11-04T12:00:00.000Z");

describe("assistant tool layer", () => {
  it("exposes the nine PRD tools and nothing else", () => {
    expect(TOOL_NAMES).toStrictEqual([
      "get_user_goals",
      "get_user_tasks",
      "get_weekly_progress",
      "get_user_preferences",
      "suggest_goal_breakdown",
      "suggest_task_creation",
      "suggest_schedule",
      "suggest_schedule_changes",
      "analyze_productivity",
    ]);
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toStrictEqual([...TOOL_NAMES]);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("reads active goals, nearest tasks, preferences and weekly counts", async () => {
    const calls: CallRecord[] = [];
    const db: FakeDb = {
      goals: [goalRow("g-active", "active"), goalRow("g-paused", "paused")],
      tasks: [
        taskRow("t-old", "todo", "2026-10-30"),
        taskRow("t-today", "in_progress", "2026-11-04"),
        taskRow("t-future", "todo", "2026-11-20"),
        taskRow("t-nodate", "todo", null),
      ],
      preferences: { wake_up_time: "07:00", sleep_time: "23:00", working_hours: { mon: [] } },
      profile: { timezone: "Europe/Berlin" },
    };
    const context: ToolContext = await buildToolContext(fakeClient(db, calls), NOW);

    expect(context.goals.map((g) => g.id)).toStrictEqual(["g-active"]);
    expect(context.tasks.map((t) => t.id)).toStrictEqual(["t-old", "t-today", "t-future", "t-nodate"]);
    expect(context.tasks[0]).toMatchObject({ id: "t-old", dueDate: "2026-10-30" });
    expect(context.preferences).toMatchObject({
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      timezone: "Europe/Berlin",
    });
    expect(context.weeklyProgress.windowDays).toBe(TOOL_WEEKLY_WINDOW_DAYS);
    expect(context.weeklyProgress.timezone).toBe("Europe/Berlin");
    // Closed window [2026-10-28, 2026-11-04]: t-old + t-today in,
    // t-future above the upper bound and t-nodate out.
    expect(context.weeklyProgress.total).toBe(2);
    expect(context.weeklyProgress.completed).toBe(0);
    expect(context.weeklyProgress.completionRate).toBe(0);
    expect(context.weeklyProgress.overdueCount).toBe(1);
    expect(context.truncated).toBe(false);

    const tables = calls.map((c) => c.table).sort();
    expect(tables).toStrictEqual([
      "goals",
      "profiles",
      "tasks",
      "tasks",
      "tasks",
      "user_preferences",
    ]);

    const weeklyCalls = calls.filter((c) => c.table === "tasks" && c.head === true);
    expect(weeklyCalls).toHaveLength(2);
    for (const call of weeklyCalls) {
      expect(call.count).toBe("exact");
      expect(call.filters).toContainEqual({ op: "gte", col: "due_date" });
      expect(call.filters).toContainEqual({ op: "lte", col: "due_date" });
    }
    expect(weeklyCalls.map((c) => c.filters.find((f) => f.col === "status")))
      .toStrictEqual([{ op: "neq", col: "status" }, { op: "eq", col: "status" }]);
  });

  it("bounds the weekly window on both ends (far-future tasks stay out)", async () => {
    const db: FakeDb = {
      goals: [],
      tasks: [
        taskRow("w-done", "completed", "2026-11-02"),
        taskRow("w-open", "todo", "2026-11-03"),
        taskRow("w-cancelled", "cancelled", "2026-11-03"),
        taskRow("w-old", "todo", "2026-10-01"),
        taskRow("w-far", "todo", "2029-06-01"),
        taskRow("w-today", "todo", "2026-11-04"),
        taskRow("w-edge", "completed", "2026-10-28"),
        taskRow("w-edge-out", "todo", "2026-10-27"),
      ],
      preferences: null,
      profile: { timezone: "UTC" },
    };
    const context = await buildToolContext(fakeClient(db), NOW);
    // Window [2026-10-28, 2026-11-04]: w-old/w-far/w-edge-out out,
    // w-cancelled excluded from totals.
    expect(context.weeklyProgress.total).toBe(4);
    expect(context.weeklyProgress.completed).toBe(2);
    expect(context.weeklyProgress.completionRate).toBe(50);
    // Overdue over the recent-tasks slice: w-old, w-edge-out, w-open.
    expect(context.weeklyProgress.overdueCount).toBe(3);
  });

  it("derives the window from the local today, not UTC (UTC+13)", async () => {
    const db: FakeDb = {
      goals: [],
      tasks: [
        taskRow("apia-old", "todo", "2026-10-28"),
        taskRow("apia-yesterday", "todo", "2026-11-04"),
        taskRow("apia-today", "completed", "2026-11-05"),
        taskRow("apia-tomorrow", "todo", "2026-11-06"),
        taskRow("apia-far", "todo", "2030-01-01"),
      ],
      preferences: null,
      profile: { timezone: "Pacific/Apia" },
    };
    // 2026-11-04T12:00Z is 01:00 on 2026-11-05 in Apia (UTC+13).
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.weeklyProgress.timezone).toBe("Pacific/Apia");
    // Local window [2026-10-29, 2026-11-05]: 10-28 counted by the old UTC
    // math, 11-06/2030 above the upper bound.
    expect(context.weeklyProgress.total).toBe(2);
    expect(context.weeklyProgress.completed).toBe(1);
    expect(context.weeklyProgress.completionRate).toBe(50);
  });

  it("keeps the percentage exact past the old 200-row slice", async () => {
    const tasks: Row[] = [];
    for (let i = 0; i < 210; i += 1) {
      tasks.push(taskRow(`done-${i}`, "completed", "2026-11-03"));
    }
    for (let i = 0; i < 40; i += 1) {
      tasks.push(taskRow(`open-${i}`, "todo", "2026-11-03"));
    }
    const db: FakeDb = { goals: [], tasks, preferences: null, profile: { timezone: "UTC" } };
    const context = await buildToolContext(fakeClient(db), NOW);
    // The old in-memory slice capped at 200 rows (200/200 = 100%); the exact
    // counts see all 250 rows. The tasks slice itself still truncates at 50.
    expect(context.weeklyProgress.total).toBe(250);
    expect(context.weeklyProgress.completed).toBe(210);
    expect(context.weeklyProgress.completionRate).toBe(84);
    expect(context.tasks).toHaveLength(50);
    expect(context.truncated).toBe(true);
  });

  it("matches src/lib single-source rules (parity with dates/progress)", async () => {
    const db: FakeDb = {
      goals: [],
      tasks: [
        taskRow("done", "completed", "2026-11-02"),
        taskRow("canc", "cancelled", "2026-11-03"),
        taskRow("open", "todo", "2026-10-30"),
        taskRow("today", "in_progress", "2026-11-04"),
        taskRow("future", "todo", "2026-11-20"),
        taskRow("nodate", "todo", null),
      ],
      preferences: null,
      profile: { timezone: "UTC" },
    };
    const context = await buildToolContext(fakeClient(db), NOW);

    expect(context.weeklyProgress.total).toBe(3);
    expect(context.weeklyProgress.completed).toBe(1);
    expect(context.weeklyProgress.completionRate).toBe(33);
    expect(context.weeklyProgress.overdueCount).toBe(1);

    // Same functions the Dashboard uses, called directly: the context must
    // agree with them exactly (closed statuses never overdue, null rate on 0).
    expect(context.weeklyProgress.completionRate).toBe(
      calculateCompletionRate(
        context.weeklyProgress.completed,
        context.weeklyProgress.total,
      ),
    );
    const expectedOverdue = context.tasks.filter((task) =>
      isTaskOverdue(
        { dueDate: task.dueDate, status: task.status as "todo" },
        NOW,
        "UTC",
      ),
    ).length;
    expect(context.weeklyProgress.overdueCount).toBe(expectedOverdue);
  });

  it("sets truncated when tasks exceed the 50-row cap", async () => {
    const tasks: Row[] = [];
    for (let i = 0; i < TOOL_TASKS_LIMIT + 5; i += 1) {
      const day = String((i % 28) + 1).padStart(2, "0");
      tasks.push(taskRow(`t-${i}`, "todo", `2026-12-${day}`));
    }
    const db: FakeDb = { goals: [], tasks, preferences: null, profile: { timezone: "UTC" } };
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.tasks).toHaveLength(TOOL_TASKS_LIMIT);
    expect(context.truncated).toBe(true);
  });

  it("sets truncated when goals exceed the cap", async () => {
    const goals: Row[] = [];
    for (let i = 0; i < TOOL_GOALS_LIMIT + 1; i += 1) {
      goals.push(goalRow(`g-${i}`, "active"));
    }
    const db: FakeDb = { goals, tasks: [], preferences: null, profile: { timezone: "UTC" } };
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.goals).toHaveLength(TOOL_GOALS_LIMIT);
    expect(context.truncated).toBe(true);
  });

  it("falls back to UTC on a garbage timezone", async () => {
    const db: FakeDb = {
      goals: [],
      tasks: [taskRow("t1", "todo", "2026-11-04")],
      preferences: null,
      profile: { timezone: "Mars/Olympus" },
    };
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.weeklyProgress.timezone).toBe("UTC");
    expect(context.weeklyProgress.total).toBe(1);
  });

  it("returns honest empty context instead of fabricated rows", async () => {
    const db: FakeDb = { goals: [], tasks: [], preferences: null, profile: null };
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.goals).toStrictEqual([]);
    expect(context.tasks).toStrictEqual([]);
    expect(context.preferences).toBeNull();
    expect(context.weeklyProgress).toMatchObject({
      total: 0,
      completed: 0,
      completionRate: null,
      overdueCount: 0,
      windowDays: 7,
    });
    expect(context.truncated).toBe(false);
  });

  it("never filters by a caller-provided user_id (identity stays in the JWT/RLS layer)", async () => {
    const calls: CallRecord[] = [];
    const db: FakeDb = {
      goals: [goalRow("g1", "active")],
      tasks: [taskRow("t1", "todo", "2026-11-05")],
      preferences: { wake_up_time: "07:00", sleep_time: "23:00", working_hours: {} },
      profile: { timezone: "UTC" },
    };
    await buildToolContext(fakeClient(db, calls), NOW);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.filters.map((f) => f.col)).not.toContain("user_id");
    }
  });
});
