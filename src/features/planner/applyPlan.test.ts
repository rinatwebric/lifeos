import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimeBlocksRow } from "@/types/database";

import { applyPlan } from "./api";
import { BlockServiceError } from "./errors";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const TASK_A = "11111111-1111-4111-8111-111111111111";
const TASK_B = "22222222-2222-4222-8222-222222222222";

const SLOT_A = {
  taskId: TASK_A,
  title: "Write the report",
  start: "2026-11-04T08:00:00.000Z",
  end: "2026-11-04T09:00:00.000Z",
};

const SLOT_B = {
  taskId: TASK_B,
  title: "Reply to the client",
  start: "2026-11-04T09:00:00.000Z",
  end: "2026-11-04T09:30:00.000Z",
};

/** The day being planned: applyPlan scopes the same-day check to it. */
const DAY_INPUT = { dateKey: "2026-11-04", timeZone: "UTC" } as const;

function blockRow(taskId: string, start: string, end: string, id = `block-${taskId}`): TimeBlocksRow {
  return {
    id,
    user_id: "u1",
    task_id: taskId,
    title: "Stored title",
    start_time: start,
    end_time: end,
    block_type: "task",
    created_at: "2026-11-04T00:00:00.000Z",
    updated_at: "2026-11-04T00:00:00.000Z",
  };
}

interface ChainMocks {
  eq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  builder: Record<string, ReturnType<typeof vi.fn>>;
}

/** Awaiting the builder resolves `result`, like the PostgREST chain. */
function chain(result: unknown): ChainMocks {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  const eq = vi.fn();
  const gt = vi.fn();
  const lt = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const inFn = vi.fn();

  Object.assign(builder, { eq, gt, lt, order, select, insert, update, in: inFn });
  eq.mockReturnValue(builder);
  gt.mockReturnValue(builder);
  lt.mockReturnValue(builder);
  order.mockReturnValue(builder);
  select.mockReturnValue(builder);
  insert.mockReturnValue(builder);
  update.mockReturnValue(builder);
  inFn.mockReturnValue(builder);

  return {
    eq,
    gt,
    lt,
    order,
    select,
    insert,
    update,
    in: inFn,
    builder: Object.assign(builder, {
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    }),
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

/**
 * Queues one chain per expected `from()` call, in call order:
 * tasks ownership → blocks pairs → insert → one mirror chain per task.
 */
function queueFrom(chains: ChainMocks[]) {
  const pending = [...chains];

  return vi.fn(() => {
    const next = pending.shift();

    if (!next) {
      throw new Error("Unexpected from() call: no queued chain left.");
    }

    return next.builder;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyPlan", () => {
  it("requires a session and writes nothing without one", async () => {
    const fromEntry = vi.fn();
    stubClient(null, fromEntry);

    await expect(applyPlan({ ...DAY_INPUT, slots: [SLOT_A] })).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(fromEntry).not.toHaveBeenCalled();
  });

  it("rejects an inverted interval before any table read", async () => {
    const fromEntry = vi.fn();
    stubClient("u1", fromEntry);

    const error = await applyPlan({
      ...DAY_INPUT,
      slots: [{ ...SLOT_A, start: SLOT_A.end, end: SLOT_A.start }],
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(BlockServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect(fromEntry).not.toHaveBeenCalled();
  });

  it("inserts the missing pairs with one read and mirrors them in one batch", async () => {
    const owned = chain({
      data: [
        { id: TASK_A, title: "Write the report" },
        { id: TASK_B, title: "Reply to the client" },
      ],
      error: null,
    });
    // The second pair already exists: only the first is inserted.
    const existing = chain({
      data: [{ task_id: TASK_B, start_time: SLOT_B.start, end_time: SLOT_B.end }],
      error: null,
    });
    const insertedRow = blockRow(TASK_A, SLOT_A.start, SLOT_A.end);
    const insert = chain({ data: [insertedRow], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    const result = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A, SLOT_B] });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      taskId: TASK_A,
      startTime: SLOT_A.start,
      endTime: SLOT_A.end,
      blockType: "task",
    });
    expect(result.mirroredTaskIds).toEqual([TASK_A]);

    // One ownership read for every linked task, one pairs read for the plan.
    expect(owned.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(owned.in).toHaveBeenCalledWith("id", [TASK_A, TASK_B]);
    expect(existing.eq).toHaveBeenCalledWith("user_id", "u1");
    // The read covers the whole planned day in UTC, not just the slot span.
    expect(existing.gt).toHaveBeenCalledWith("end_time", "2026-11-04T00:00:00.000Z");
    expect(existing.lt).toHaveBeenCalledWith("start_time", "2026-11-05T00:00:00.000Z");

    // The existing pair is skipped: a single insert with the missing row.
    expect(insert.insert).toHaveBeenCalledOnce();
    expect(insert.insert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        user_id: "u1",
        task_id: TASK_A,
        title: "Write the report",
        start_time: SLOT_A.start,
        end_time: SLOT_A.end,
        block_type: "task",
      }),
    ]);

    // The mirror follows the inserted block, scoped by id + JWT identity.
    expect(mirror.update).toHaveBeenCalledOnce();
    expect(mirror.update).toHaveBeenCalledWith({
      scheduled_start: SLOT_A.start,
      scheduled_end: SLOT_A.end,
    });
    expect(mirror.eq).toHaveBeenCalledWith("id", TASK_A);
    expect(mirror.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("inserts nothing and mirrors nothing when every pair already exists", async () => {
    const owned = chain({
      data: [
        { id: TASK_A, title: "Write the report" },
        { id: TASK_B, title: "Reply to the client" },
      ],
      error: null,
    });
    const existing = chain({
      data: [
        { task_id: TASK_A, start_time: SLOT_A.start, end_time: SLOT_A.end },
        { task_id: TASK_B, start_time: SLOT_B.start, end_time: SLOT_B.end },
      ],
      error: null,
    });
    const fromEntry = queueFrom([owned, existing]);
    stubClient("u1", fromEntry);

    // The repeat of the previous test's Accept: the same slots, already stored.
    const result = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A, SLOT_B] });

    expect(result).toEqual({ blocks: [], mirroredTaskIds: [], skippedTaskIds: [TASK_A, TASK_B] });
    expect(fromEntry).toHaveBeenCalledTimes(2);
  });

  it("treats a Postgres +00:00 pair as the same instant and writes nothing", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    // PostgREST returns timestamptz as "+00:00" while the slot carries "Z":
    // the same instant, different strings. A raw-string key would miss it.
    const existing = chain({
      data: [
        {
          task_id: TASK_A,
          start_time: "2026-11-04T08:00:00+00:00",
          end_time: "2026-11-04T09:00:00+00:00",
        },
      ],
      error: null,
    });
    const insert = chain({ data: [], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    const result = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A] });

    expect(result).toEqual({ blocks: [], mirroredTaskIds: [], skippedTaskIds: [TASK_A] });
    expect(fromEntry).toHaveBeenCalledTimes(2);
    expect(insert.insert).not.toHaveBeenCalled();
    expect(mirror.update).not.toHaveBeenCalled();
  });

  it("treats a Postgres microsecond pair as the same instant and writes nothing", async () => {
    const microSlot = {
      taskId: TASK_A,
      title: "Write the report",
      start: "2026-11-04T08:00:00.123Z",
      end: "2026-11-04T09:00:00.123Z",
    };
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    // Postgres keeps microseconds; JS dates keep milliseconds. The stored
    // pair is the same instant at millisecond precision — no duplicate.
    const existing = chain({
      data: [
        {
          task_id: TASK_A,
          start_time: "2026-11-04T08:00:00.123456+00:00",
          end_time: "2026-11-04T09:00:00.123456+00:00",
        },
      ],
      error: null,
    });
    const insert = chain({ data: [], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    const result = await applyPlan({ ...DAY_INPUT, slots: [microSlot] });

    expect(result).toEqual({ blocks: [], mirroredTaskIds: [], skippedTaskIds: [TASK_A] });
    expect(fromEntry).toHaveBeenCalledTimes(2);
    expect(insert.insert).not.toHaveBeenCalled();
    expect(mirror.update).not.toHaveBeenCalled();
  });

  it("rejects a slot with an unparsable date without touching the database", async () => {
    const fromEntry = vi.fn();
    stubClient("u1", fromEntry);

    const error = await applyPlan({
      ...DAY_INPUT,
      slots: [{ ...SLOT_A, start: "not-a-date" }],
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(BlockServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect(fromEntry).not.toHaveBeenCalled();
  });

  it("dedupes an identical pair sent twice inside one call", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    const existing = chain({ data: [], error: null });
    const insertedRow = blockRow(TASK_A, SLOT_A.start, SLOT_A.end);
    const insert = chain({ data: [insertedRow], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    const result = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A, SLOT_A] });

    expect(result.blocks).toHaveLength(1);
    expect(insert.insert.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("does not create a second block for a task that already has one that day", async () => {
    const dayBlock = blockRow(TASK_A, SLOT_A.start, SLOT_A.end, "block-day");
    const owned = chain({
      data: [
        { id: TASK_A, title: "Write the report" },
        { id: TASK_B, title: "Reply to the client" },
      ],
      error: null,
    });
    const existing = chain({ data: [dayBlock], error: null });
    const insertedRow = blockRow(
      TASK_B,
      "2026-11-04T15:00:00.000Z",
      "2026-11-04T15:30:00.000Z",
      "block-fresh",
    );
    const insert = chain({ data: [insertedRow], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    const sameTaskSlot = {
      taskId: TASK_A,
      title: "Write the report",
      start: "2026-11-04T15:00:00.000Z",
      end: "2026-11-04T16:00:00.000Z",
    };
    const freshSlot = {
      taskId: TASK_B,
      title: "Reply to the client",
      start: "2026-11-04T16:00:00.000Z",
      end: "2026-11-04T16:30:00.000Z",
    };
    const result = await applyPlan({ ...DAY_INPUT, slots: [sameTaskSlot, freshSlot] });

    expect(insert.insert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ task_id: TASK_B }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.mirroredTaskIds).toEqual([TASK_B]);
    expect(result.skippedTaskIds).toEqual([TASK_A]);
    expect(fromEntry).toHaveBeenCalledTimes(4);
  });

  it("falls back to the stored task title when the slot arrives untitled", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Stored title" }], error: null });
    const existing = chain({ data: [], error: null });
    const insertedRow = blockRow(TASK_A, SLOT_A.start, SLOT_A.end);
    const insert = chain({ data: [insertedRow], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    await applyPlan({ ...DAY_INPUT, slots: [{ ...SLOT_A, title: "" }] });

    expect(insert.insert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ title: "Stored title" }),
    ]);
  });

  it("rejects a foreign task before any block write", async () => {
    const owned = chain({ data: [], error: null });
    const fromEntry = queueFrom([owned]);
    stubClient("u1", fromEntry);

    const error = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A] }).catch(
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(BlockServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect(fromEntry).toHaveBeenCalledTimes(1);
  });

  it("throws a coded error without hiding a failed insert", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    const existing = chain({ data: [], error: null });
    const insert = chain({ data: null, error: { code: "23514", message: "check" } });
    const fromEntry = queueFrom([owned, existing, insert]);
    stubClient("u1", fromEntry);

    await expect(applyPlan({ ...DAY_INPUT, slots: [SLOT_A] })).rejects.toMatchObject({
      code: "validation",
    });
    expect(fromEntry).toHaveBeenCalledTimes(3);
  });

  it("throws a coded mirror error after the blocks are already inserted", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    const existing = chain({ data: [], error: null });
    const insertedRow = blockRow(TASK_A, SLOT_A.start, SLOT_A.end);
    const insert = chain({ data: [insertedRow], error: null });
    const mirror = chain({ data: null, error: { code: "42501", message: "denied" } });
    const fromEntry = queueFrom([owned, existing, insert, mirror]);
    stubClient("u1", fromEntry);

    // The block row stays in the database (no transaction without an RPC);
    // the caller sees the coded error instead of a silent partial accept.
    await expect(applyPlan({ ...DAY_INPUT, slots: [SLOT_A] })).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(insert.insert).toHaveBeenCalledOnce();
  });

  it("does not create a second block for a task that has one that day", async () => {
    const owned = chain({ data: [{ id: TASK_A, title: "Write the report" }], error: null });
    // The task already owns a 09:00–10:00 block on the planned day: a slot
    // for another time is skipped, not inserted.
    const existing = chain({
      data: [{ task_id: TASK_A, start_time: SLOT_A.start, end_time: SLOT_A.end }],
      error: null,
    });
    const fromEntry = queueFrom([owned, existing]);
    stubClient("u1", fromEntry);

    const afternoon = {
      taskId: TASK_A,
      title: "Write the report",
      start: "2026-11-04T14:00:00.000Z",
      end: "2026-11-04T15:00:00.000Z",
    };
    const result = await applyPlan({ ...DAY_INPUT, slots: [afternoon] });

    expect(result).toEqual({ blocks: [], mirroredTaskIds: [], skippedTaskIds: [TASK_A] });
    expect(fromEntry).toHaveBeenCalledTimes(2);
  });

  it("second accept after the plan is in blocks inserts nothing", async () => {
    const ownedRows = {
      data: [
        { id: TASK_A, title: "Write the report" },
        { id: TASK_B, title: "Reply to the client" },
      ],
      error: null,
    };
    // First accept: nothing stored yet, both slots are inserted + mirrored.
    stubClient(
      "u1",
      queueFrom([
        chain(ownedRows),
        chain({ data: [], error: null }),
        chain({
          data: [blockRow(TASK_A, SLOT_A.start, SLOT_A.end), blockRow(TASK_B, SLOT_B.start, SLOT_B.end)],
          error: null,
        }),
        chain({ data: null, error: null }),
        chain({ data: null, error: null }),
      ]),
    );

    const first = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A, SLOT_B] });

    expect(first.blocks).toHaveLength(2);
    expect(first.skippedTaskIds).toEqual([]);

    // Second accept: the same slots are already blocks — no insert, no mirror.
    const insert = chain({ data: [], error: null });
    const mirror = chain({ data: null, error: null });
    const fromEntry = queueFrom([
      chain(ownedRows),
      chain({
        data: [
          { task_id: TASK_A, start_time: SLOT_A.start, end_time: SLOT_A.end },
          { task_id: TASK_B, start_time: SLOT_B.start, end_time: SLOT_B.end },
        ],
        error: null,
      }),
      insert,
      mirror,
    ]);
    stubClient("u1", fromEntry);

    const second = await applyPlan({ ...DAY_INPUT, slots: [SLOT_A, SLOT_B] });

    expect(second).toEqual({ blocks: [], mirroredTaskIds: [], skippedTaskIds: [TASK_A, TASK_B] });
    expect(fromEntry).toHaveBeenCalledTimes(2);
    expect(insert.insert).not.toHaveBeenCalled();
    expect(mirror.update).not.toHaveBeenCalled();
  });

  it("accepts an empty plan without touching any table", async () => {
    const fromEntry = vi.fn();
    stubClient("u1", fromEntry);

    await expect(applyPlan({ ...DAY_INPUT, slots: [] })).resolves.toEqual({
      blocks: [],
      mirroredTaskIds: [],
      skippedTaskIds: [],
    });
    expect(fromEntry).not.toHaveBeenCalled();
  });
});
