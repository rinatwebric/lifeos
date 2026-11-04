import { describe, expect, it } from "vitest";

import type { ProposalAction } from "@/lib/aiProposals";

import {
  validateActions,
  type ValidateClient,
  type ValidateContext,
} from "./validate.ts";

type Row = Record<string, unknown>;

interface FakeDb {
  tables: Record<string, Row[]>;
  /** Tables whose query resolves with an error (storage failure). */
  errors?: Record<string, boolean>;
  /** Caller identity the fake RLS enforces. */
  callerId?: string;
}

interface CallRecord {
  table: string;
  filters: Array<{ op: string; col: string; values?: unknown }>;
}

/** Fake user-scoped client: only `callerId` rows are visible (RLS simulation). */
class FakeValidateQuery {
  private filters: Array<{ op: string; col: string; values: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly db: FakeDb,
    private readonly calls: CallRecord[],
  ) {}

  select(_cols: string): this {
    return this;
  }

  eq(col: string, value: string): this {
    this.filters.push({ op: "eq", col, values: value });
    return this;
  }

  in(col: string, values: string[]): this {
    this.filters.push({ op: "in", col, values });
    return this;
  }

  gt(col: string, value: string): this {
    this.filters.push({ op: "gt", col, values: value });
    return this;
  }

  lt(col: string, value: string): this {
    this.filters.push({ op: "lt", col, values: value });
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.calls.push({
      table: this.table,
      filters: this.filters.map((filter) => ({ op: filter.op, col: filter.col, values: filter.values })),
    });
    if (this.db.errors?.[this.table]) {
      return Promise.resolve({ data: null, error: { message: "db down" } }).then(
        onfulfilled,
        onrejected ?? undefined,
      );
    }
    const callerId = this.db.callerId ?? "user-1";
    let rows = (this.db.tables[this.table] ?? []).filter(
      (row) => row.user_id === undefined || row.user_id === callerId,
    );
    for (const filter of this.filters) {
      if (filter.op === "eq") {
        rows = rows.filter((row) => row[filter.col] === filter.values);
      } else if (filter.op === "in") {
        const set = new Set(filter.values as string[]);
        rows = rows.filter((row) => set.has(row[filter.col] as string));
      } else if (filter.op === "gt") {
        rows = rows.filter(
          (row) => typeof row[filter.col] === "string" && (row[filter.col] as string) > (filter.values as string),
        );
      } else if (filter.op === "lt") {
        rows = rows.filter(
          (row) => typeof row[filter.col] === "string" && (row[filter.col] as string) < (filter.values as string),
        );
      }
    }
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected ?? undefined);
  }
}

function fakeClient(db: FakeDb, calls: CallRecord[] = []): ValidateClient {
  return {
    from: (table: string) =>
      new FakeValidateQuery(table, db, calls) as unknown as ReturnType<ValidateClient["from"]>,
  };
}

const NOW = new Date("2026-11-04T12:00:00.000Z");

function contextFor(db: FakeDb, calls: CallRecord[] = []): ValidateContext {
  return {
    client: fakeClient(db, calls),
    now: NOW,
    timeZone: "UTC",
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
  };
}

function ownedDb(): FakeDb {
  return {
    callerId: "user-1",
    tables: {
      goals: [{ id: "g1", user_id: "user-1" }],
      milestones: [
        { id: "m1", user_id: "user-1", goal_id: "g1", status: "pending" },
        { id: "m2", user_id: "user-1", goal_id: "g1", status: "completed" },
        { id: "m-other-goal", user_id: "user-1", goal_id: "g2", status: "pending" },
      ],
      tasks: [
        { id: "t1", user_id: "user-1", status: "todo" },
        { id: "t-done", user_id: "user-1", status: "completed" },
        { id: "t-cancelled", user_id: "user-1", status: "cancelled" },
        { id: "t-foreign", user_id: "user-2", status: "todo" },
      ],
      time_blocks: [
        {
          id: "b1",
          user_id: "user-1",
          start_time: "2026-11-05T10:00:00.000Z",
          end_time: "2026-11-05T11:00:00.000Z",
        },
      ],
    },
  };
}

function createGoal(overrides: Partial<Extract<ProposalAction, { type: "create_goal" }>> = {}): ProposalAction {
  return {
    type: "create_goal",
    title: "Run a marathon",
    description: null,
    category: "health",
    priority: "high",
    targetDate: "2026-12-01",
    ...overrides,
  };
}

describe("validateActions", () => {
  it("accepts one happy-path action of each of the 7 types", async () => {
    const db = ownedDb();
    const actions: ProposalAction[] = [
      createGoal(),
      { type: "create_milestone", goalId: "g1", title: "Base", targetDate: "2026-12-01" },
      { type: "complete_milestone", milestoneId: "m1" },
      {
        type: "create_task",
        title: "Buy shoes",
        description: null,
        goalId: "g1",
        milestoneId: "m1",
        priority: "medium",
        dueDate: "2026-11-20",
        estimatedDurationMinutes: 30,
      },
      { type: "reschedule_task", taskId: "t1", newDate: "2026-11-10", reason: null },
      {
        type: "schedule_blocks",
        taskId: "t1",
        startTime: "2026-11-05T12:00:00.000Z",
        endTime: "2026-11-05T13:00:00.000Z",
      },
      {
        type: "update_preferences",
        wakeUpTime: "06:30",
        sleepTime: "22:30",
        timezone: "Europe/Berlin",
        language: "ru",
        theme: "dark",
      },
    ];
    for (const [index, action] of actions.entries()) {
      const result = await validateActions([action], contextFor(ownedDb()));
      expect(result, `action ${index} (${action.type}) should pass`).toStrictEqual({ ok: true });
    }
    expect(await validateActions(actions, contextFor(db))).toStrictEqual({ ok: true });
  });

  it("reports missing_goal for an unknown or foreign goal", async () => {
    const missing = await validateActions(
      [{ type: "create_milestone", goalId: "ghost", title: "Base", targetDate: null }],
      contextFor(ownedDb()),
    );
    expect(missing).toMatchObject({ ok: false, index: 0, code: "missing_goal" });

    const foreignDb = ownedDb();
    foreignDb.tables.goals = [{ id: "g-foreign", user_id: "user-2" }];
    const foreign = await validateActions(
      [{ type: "create_milestone", goalId: "g-foreign", title: "Base", targetDate: null }],
      contextFor(foreignDb),
    );
    expect(foreign).toMatchObject({ ok: false, index: 0, code: "missing_goal" });
  });

  it("reports missing_milestone for unknown, mismatched, or foreign milestones", async () => {
    const unknown = await validateActions(
      [{ type: "complete_milestone", milestoneId: "ghost" }],
      contextFor(ownedDb()),
    );
    expect(unknown).toMatchObject({ ok: false, index: 0, code: "missing_milestone" });

    const mismatch = await validateActions(
      [
        {
          type: "create_task",
          title: "Shoes",
          description: null,
          goalId: "g1",
          milestoneId: "m-other-goal",
          priority: null,
          dueDate: null,
          estimatedDurationMinutes: null,
        },
      ],
      contextFor(ownedDb()),
    );
    expect(mismatch).toMatchObject({ ok: false, index: 0, code: "missing_milestone" });
  });

  it("reports missing_task for unknown or foreign tasks", async () => {
    const unknown = await validateActions(
      [{ type: "reschedule_task", taskId: "ghost", newDate: "2026-11-10", reason: null }],
      contextFor(ownedDb()),
    );
    expect(unknown).toMatchObject({ ok: false, index: 0, code: "missing_task" });

    const foreign = await validateActions(
      [{ type: "reschedule_task", taskId: "t-foreign", newDate: "2026-11-10", reason: null }],
      contextFor(ownedDb()),
    );
    expect(foreign).toMatchObject({ ok: false, index: 0, code: "missing_task" });
  });

  it("reports wrong_status for completed milestones and closed tasks", async () => {
    const cases: ProposalAction[] = [
      { type: "complete_milestone", milestoneId: "m2" },
      { type: "reschedule_task", taskId: "t-done", newDate: "2026-11-10", reason: null },
      {
        type: "schedule_blocks",
        taskId: "t-cancelled",
        startTime: "2026-11-05T12:00:00.000Z",
        endTime: "2026-11-05T13:00:00.000Z",
      },
    ];
    for (const action of cases) {
      const result = await validateActions([action], contextFor(ownedDb()));
      expect(result).toMatchObject({ ok: false, index: 0, code: "wrong_status" });
    }
  });

  it("reports invalid_date for bad ISO dates, wall times and timezones", async () => {
    const cases: ProposalAction[] = [
      {
        type: "create_task",
        title: "Shoes",
        description: null,
        goalId: null,
        milestoneId: null,
        priority: null,
        dueDate: "not-a-date",
        estimatedDurationMinutes: null,
      },
      {
        type: "schedule_blocks",
        taskId: "t1",
        startTime: "tomorrow 10am",
        endTime: "2026-11-05T13:00:00.000Z",
      },
      {
        type: "update_preferences",
        wakeUpTime: "7am",
        sleepTime: null,
        timezone: null,
        language: null,
        theme: null,
      },
      {
        type: "update_preferences",
        wakeUpTime: null,
        sleepTime: null,
        timezone: "Mars/Olympus",
        language: null,
        theme: null,
      },
    ];
    for (const action of cases) {
      const result = await validateActions([action], contextFor(ownedDb()));
      expect(result).toMatchObject({ ok: false, index: 0, code: "invalid_date" });
    }
  });

  it("reports inverted_interval for end <= start and wake == sleep", async () => {
    const inverted = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T13:00:00.000Z",
          endTime: "2026-11-05T12:00:00.000Z",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(inverted).toMatchObject({ ok: false, index: 0, code: "inverted_interval" });

    const equalSleep = await validateActions(
      [
        {
          type: "update_preferences",
          wakeUpTime: "07:00",
          sleepTime: "07:00",
          timezone: null,
          language: null,
          theme: null,
        },
      ],
      contextFor(ownedDb()),
    );
    expect(equalSleep).toMatchObject({ ok: false, index: 0, code: "inverted_interval" });
  });

  it("reports conflict for overlap and for sleep hours", async () => {
    const overlap = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T10:30:00.000Z",
          endTime: "2026-11-05T11:30:00.000Z",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(overlap).toMatchObject({ ok: false, index: 0, code: "conflict" });

    const sleep = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T02:00:00.000Z",
          endTime: "2026-11-05T03:00:00.000Z",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(sleep).toMatchObject({ ok: false, index: 0, code: "conflict" });
  });

  it("treats touching edges as no conflict", async () => {
    const result = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T11:00:00.000Z",
          endTime: "2026-11-05T12:00:00.000Z",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(result).toStrictEqual({ ok: true });
  });

  it("reports past for a past newDate and a past interval", async () => {
    const reschedule = await validateActions(
      [{ type: "reschedule_task", taskId: "t1", newDate: "2026-11-01", reason: null }],
      contextFor(ownedDb()),
    );
    expect(reschedule).toMatchObject({ ok: false, index: 0, code: "past" });

    const interval = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-03T10:00:00.000Z",
          endTime: "2026-11-03T11:00:00.000Z",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(interval).toMatchObject({ ok: false, index: 0, code: "past" });
  });

  it("accepts rescheduling to today (only strictly past is past)", async () => {
    const result = await validateActions(
      [{ type: "reschedule_task", taskId: "t1", newDate: "2026-11-04", reason: null }],
      contextFor(ownedDb()),
    );
    expect(result).toStrictEqual({ ok: true });
  });

  it("reports no_time for a zero or negative duration", async () => {
    for (const minutes of [0, -30]) {
      const result = await validateActions(
        [
          {
            type: "create_task",
            title: "Shoes",
            description: null,
            goalId: null,
            milestoneId: null,
            priority: null,
            dueDate: null,
            estimatedDurationMinutes: minutes,
          },
        ],
        contextFor(ownedDb()),
      );
      expect(result).toMatchObject({ ok: false, index: 0, code: "no_time" });
    }
  });

  it("reports forbidden for storage errors and unsupported preference values", async () => {
    const failingDb = ownedDb();
    failingDb.errors = { goals: true };
    const storage = await validateActions(
      [{ type: "create_milestone", goalId: "g1", title: "Base", targetDate: null }],
      contextFor(failingDb),
    );
    expect(storage).toMatchObject({ ok: false, index: 0, code: "forbidden" });

    const language = await validateActions(
      [
        {
          type: "update_preferences",
          wakeUpTime: null,
          sleepTime: null,
          timezone: null,
          language: "xx",
          theme: null,
        },
      ],
      contextFor(ownedDb()),
    );
    expect(language).toMatchObject({ ok: false, index: 0, code: "forbidden" });

    const theme = await validateActions(
      [
        {
          type: "update_preferences",
          wakeUpTime: null,
          sleepTime: null,
          timezone: null,
          language: null,
          theme: "neon",
        },
      ],
      contextFor(ownedDb()),
    );
    expect(theme).toMatchObject({ ok: false, index: 0, code: "forbidden" });
  });

  it("fails the lowest index first, even across check phases", async () => {
    const result = await validateActions(
      [
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T10:30:00.000Z",
          endTime: "2026-11-05T11:30:00.000Z",
        },
        { type: "reschedule_task", taskId: "ghost", newDate: "2026-11-10", reason: null },
      ],
      contextFor(ownedDb()),
    );
    expect(result).toMatchObject({ ok: false, index: 0, code: "conflict" });

    const later = await validateActions(
      [
        createGoal(),
        { type: "reschedule_task", taskId: "ghost", newDate: "2026-11-10", reason: null },
      ],
      contextFor(ownedDb()),
    );
    expect(later).toMatchObject({ ok: false, index: 1, code: "missing_task" });
  });

  it("batches reference reads: one query per entity, one blocks query per span", async () => {
    const calls: CallRecord[] = [];
    const db = ownedDb();
    const result = await validateActions(
      [
        { type: "reschedule_task", taskId: "t1", newDate: "2026-11-10", reason: null },
        { type: "reschedule_task", taskId: "t-done", newDate: "2026-11-10", reason: null },
        {
          type: "schedule_blocks",
          taskId: "t1",
          startTime: "2026-11-05T12:00:00.000Z",
          endTime: "2026-11-05T13:00:00.000Z",
        },
        {
          type: "schedule_blocks",
          taskId: "t-done",
          startTime: "2026-11-06T12:00:00.000Z",
          endTime: "2026-11-06T13:00:00.000Z",
        },
      ],
      contextFor(db, calls),
    );
    expect(result.ok).toBe(false);
    const byTable = (table: string): CallRecord[] => calls.filter((call) => call.table === table);
    expect(byTable("tasks")).toHaveLength(1);
    expect(byTable("goals")).toHaveLength(0);
    expect(byTable("milestones")).toHaveLength(0);
    expect(byTable("time_blocks")).toHaveLength(1);
  });

  it("runs no queries for entity-free actions", async () => {
    const calls: CallRecord[] = [];
    const result = await validateActions([createGoal()], contextFor(ownedDb(), calls));
    expect(result).toStrictEqual({ ok: true });
    expect(calls).toStrictEqual([]);
  });
});
