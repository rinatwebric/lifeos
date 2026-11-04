import { describe, expect, it } from "vitest";

import {
  TOOL_DEFINITIONS,
  TOOL_GOALS_LIMIT,
  TOOL_NAMES,
  TOOL_TASKS_LIMIT,
  TOOL_WEEKLY_LIMIT,
  TOOL_WEEKLY_WINDOW_DAYS,
  buildToolContext,
  type ToolContext,
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
  filters: Array<{ op: string; col: string }>;
}

/** Chainable fake honoring eq/gte/order/limit/single over in-memory rows. */
class FakeQuery {
  private selectCols = "*";
  private filters: Array<{ op: "eq" | "gte"; col: string; val: string }> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(
    private readonly table: string,
    private readonly db: FakeDb,
    private readonly calls: CallRecord[],
  ) {}

  select(cols: string): this {
    this.selectCols = cols;
    return this;
  }

  eq(col: string, val: string): this {
    this.filters.push({ op: "eq", col, val });
    return this;
  }

  gte(col: string, val: string): this {
    this.filters.push({ op: "gte", col, val });
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

  single(): Promise<{ data: unknown; error: unknown }> {
    this.record();
    const rows = this.apply();
    if (rows.length === 0) {
      return Promise.resolve({ data: null, error: { message: "no rows" } });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.record();
    return Promise.resolve({ data: this.apply(), error: null }).then(onfulfilled, onrejected);
  }

  private record(): void {
    this.calls.push({
      table: this.table,
      selectCols: this.selectCols,
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
      } else {
        rows = rows.filter((row) => {
          const value = row[filter.col];
          return typeof value === "string" && value >= filter.val;
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
    if (this.limitN !== null) {
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

  it("reads active goals, nearest tasks, preferences and weekly progress in parallel", async () => {
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
    expect(context.truncated).toBe(false);

    const tables = calls.map((c) => c.table).sort();
    expect(tables).toStrictEqual(["goals", "profiles", "tasks", "tasks", "user_preferences"]);
  });

  it("computes weekly progress with Dashboard formulas and excludes cancelled", async () => {
    const db: FakeDb = {
      goals: [],
      tasks: [
        taskRow("w-done", "completed", "2026-11-02"),
        taskRow("w-open", "todo", "2026-11-03"),
        taskRow("w-cancelled", "cancelled", "2026-11-03"),
        taskRow("w-old", "todo", "2026-10-01"),
        taskRow("t-overdue", "todo", "2026-10-30"),
      ],
      preferences: null,
      profile: { timezone: "UTC" },
    };
    const context = await buildToolContext(fakeClient(db), NOW);
    // Weekly window (UTC pre-filter): 2026-10-28.. — w-old is out, cancelled excluded from totals.
    expect(context.weeklyProgress.total).toBe(3);
    expect(context.weeklyProgress.completed).toBe(1);
    expect(context.weeklyProgress.completionRate).toBe(33);
    // Overdue over the recent-tasks slice: w-open? no (future vs today 2026-11-04? 11-03 < 11-04 → overdue too).
    expect(context.weeklyProgress.overdueCount).toBeGreaterThanOrEqual(1);
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

  it("sets truncated when the weekly window overflows", async () => {
    const tasks: Row[] = [];
    for (let i = 0; i < TOOL_WEEKLY_LIMIT + 10; i += 1) {
      tasks.push(taskRow(`w-${i}`, "todo", "2026-11-03"));
    }
    const db: FakeDb = { goals: [], tasks, preferences: null, profile: { timezone: "UTC" } };
    const context = await buildToolContext(fakeClient(db), NOW);
    expect(context.truncated).toBe(true);
    expect(context.weeklyProgress.total).toBe(TOOL_WEEKLY_LIMIT);
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
