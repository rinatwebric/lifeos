import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimeBlocksRow } from "@/types/database";

import { createBlock, deleteBlock, listBlocks, updateBlock } from "./api";
import { BlockServiceError, BLOCK_ERROR_MESSAGES } from "./errors";
import { planner } from "./queryKeys";
import { createBlockSchema, updateBlockSchema } from "./schemas";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const BLOCK_ROW: TimeBlocksRow = {
  id: "b1",
  user_id: "u1",
  task_id: "t1",
  title: "Deep work",
  start_time: "2026-11-04T10:00:00.000Z",
  end_time: "2026-11-04T11:00:00.000Z",
  block_type: "task",
  created_at: "2026-11-04T00:00:00.000Z",
  updated_at: "2026-11-04T00:00:00.000Z",
};

const RANGE = { from: "2026-11-04T00:00:00.000Z", to: "2026-11-05T00:00:00.000Z" };

function blockRow(overrides: Partial<TimeBlocksRow> & { id: string }): TimeBlocksRow {
  return { ...BLOCK_ROW, ...overrides };
}

interface BuilderMocks {
  eq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
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
  const gt = vi.fn();
  const lt = vi.fn();
  const neq = vi.fn();
  const limit = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();
  const single = vi.fn();

  Object.assign(builder, { eq, gt, lt, neq, limit, order, select, insert, update, single });
  builder["delete"] = deleteFn;

  eq.mockReturnValue(builder);
  gt.mockReturnValue(builder);
  lt.mockReturnValue(builder);
  neq.mockReturnValue(builder);
  limit.mockReturnValue(builder);
  order.mockReturnValue(builder);
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

  return { eq, gt, lt, neq, limit, order, select, insert, update, delete: deleteFn, single, builder: withThen };
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

describe("planner api", () => {
  it("lists overlapping blocks for the JWT identity in start_time order", async () => {
    const { builder, eq, gt, lt, order } = mockBuilder({ data: [BLOCK_ROW], error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await listBlocks(RANGE);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "b1",
      taskId: "t1",
      title: "Deep work",
      startTime: "2026-11-04T10:00:00.000Z",
      endTime: "2026-11-04T11:00:00.000Z",
      blockType: "task",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(gt).toHaveBeenCalledWith("end_time", RANGE.from);
    expect(lt).toHaveBeenCalledWith("start_time", RANGE.to);
    expect(order).toHaveBeenCalledWith("start_time", { ascending: true });
  });

  it("requires a session for every call", async () => {
    stubClient(null, vi.fn());

    await expect(listBlocks(RANGE)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createBlock({
        title: "x",
        startTime: RANGE.from,
        endTime: RANGE.to,
        blockType: "personal",
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateBlock("b1", { title: "x" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(deleteBlock("b1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("creates a task block with the JWT user_id and trims the title", async () => {
    const owned = mockBuilder({ data: null, error: null }, { data: { id: "t1" }, error: null });
    const blocks = mockBuilder({ data: null, error: null }, { data: BLOCK_ROW, error: null });
    const fromEntry = vi.fn((table: string) => (table === "tasks" ? owned.builder : blocks.builder));
    stubClient("jwt-user-7", fromEntry);

    await createBlock({
      title: "  Deep work  ",
      startTime: BLOCK_ROW.start_time,
      endTime: BLOCK_ROW.end_time,
      blockType: "task",
      taskId: "t1",
    });

    expect(fromEntry).toHaveBeenCalledWith("tasks");
    expect(owned.eq).toHaveBeenCalledWith("id", "t1");
    expect(owned.eq).toHaveBeenCalledWith("user_id", "jwt-user-7");
    expect(blocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "jwt-user-7",
        title: "Deep work",
        task_id: "t1",
        block_type: "task",
      }),
    );
  });

  it("creates a break block with a null task link and no tasks read", async () => {
    const row = blockRow({ id: "b2", task_id: null, block_type: "break" });
    const { builder, insert } = mockBuilder({ data: null, error: null }, { data: row, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const created = await createBlock({
      title: "Rest",
      startTime: row.start_time,
      endTime: row.end_time,
      blockType: "break",
      taskId: null,
    });

    expect(created.taskId).toBeNull();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ task_id: null }));
    expect(fromEntry).not.toHaveBeenCalledWith("tasks");
  });

  it("rejects a task block without a task before any write", async () => {
    const { builder, insert } = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(
      createBlock({
        title: "Orphan",
        startTime: BLOCK_ROW.start_time,
        endTime: BLOCK_ROW.end_time,
        blockType: "task",
        taskId: null,
      }),
    ).rejects.toMatchObject({ code: "validation" });

    expect(insert).not.toHaveBeenCalled();
    expect(fromEntry).not.toHaveBeenCalledWith("tasks");
  });

  it("rejects a break block linked to a task before any write", async () => {
    const { builder, insert } = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(
      createBlock({
        title: "Break with task",
        startTime: BLOCK_ROW.start_time,
        endTime: BLOCK_ROW.end_time,
        blockType: "break",
        taskId: "t1",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a foreign task as validation, not a raw PostgREST error", async () => {
    const foreign = mockBuilder(
      { data: null, error: null },
      { data: null, error: { code: "PGRST116", message: "0 rows" } },
    );
    const blocks = mockBuilder({ data: null, error: null }, { data: BLOCK_ROW, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? foreign.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    const error = await createBlock({
      title: "Foreign",
      startTime: BLOCK_ROW.start_time,
      endTime: BLOCK_ROW.end_time,
      blockType: "task",
      taskId: " чужой-task",
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(BlockServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect(blocks.insert).not.toHaveBeenCalled();
  });

  it("updates a title with a partial payload and trims it", async () => {
    const updated = blockRow({ id: "b1", title: "Renamed" });
    const { builder, update } = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const result = await updateBlock("b1", { title: "  Renamed  " });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: "Renamed" }));
    expect(result.title).toBe("Renamed");
  });

  it("rejects clearing the task link on a task block", async () => {
    const current = blockRow({ id: "b1", block_type: "task", task_id: "t1" });
    const { builder, update, single } = mockBuilder(
      { data: null, error: null },
      { data: { ...current, task_id: null }, error: null },
    );
    single.mockResolvedValueOnce({ data: current, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await expect(updateBlock("b1", { taskId: null })).rejects.toMatchObject({
      code: "validation",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects attaching a task to a break block", async () => {
    const current = blockRow({ id: "b2", block_type: "break", task_id: null });
    const { builder, update, single } = mockBuilder(
      { data: null, error: null },
      { data: current, error: null },
    );
    single.mockResolvedValueOnce({ data: current, error: null });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    await expect(updateBlock("b2", { taskId: "t1" })).rejects.toMatchObject({
      code: "validation",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("relinks a task block to another owned task", async () => {
    const current = blockRow({ id: "b1", block_type: "task", task_id: "t1" });
    const owned = mockBuilder({ data: null, error: null }, { data: { id: "t2" }, error: null });
    const blocks = mockBuilder(
      { data: null, error: null },
      { data: { ...current, task_id: "t2" }, error: null },
    );
    blocks.single.mockResolvedValueOnce({ data: current, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? owned.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    const result = await updateBlock("b1", { taskId: "t2" });

    expect(result.taskId).toBe("t2");
    expect(blocks.update).toHaveBeenCalledWith(expect.objectContaining({ task_id: "t2" }));
  });

  it("deleteBlock clears the task mirror and deletes the block in one call", async () => {
    const blocks = mockBuilder(
      { data: [], error: null },
      { data: { task_id: "t1" }, error: null },
    );
    const mirror = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    await deleteBlock("b1");

    expect(mirror.update).toHaveBeenCalledWith({ scheduled_start: null, scheduled_end: null });
    expect(mirror.eq).toHaveBeenCalledWith("id", "t1");
    expect(mirror.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(blocks.delete).toHaveBeenCalledOnce();
    expect(blocks.eq).toHaveBeenCalledWith("id", "b1");
    expect(blocks.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("deleteBlock on a break block skips the tasks write", async () => {
    const blocks = mockBuilder({ data: null, error: null }, { data: { task_id: null }, error: null });
    const fromEntry = vi.fn().mockReturnValue(blocks.builder);
    stubClient("u1", fromEntry);

    await deleteBlock("b2");

    expect(fromEntry).not.toHaveBeenCalledWith("tasks");
    expect(blocks.delete).toHaveBeenCalledOnce();
    expect(blocks.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("does not delete the block when clearing the mirror fails", async () => {
    const blocks = mockBuilder(
      { data: [], error: null },
      { data: { task_id: "t1" }, error: null },
    );
    const mirror = mockBuilder({ data: null, error: { code: "42501", message: "denied" } });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    await expect(deleteBlock("b1")).rejects.toMatchObject({ code: "forbidden" });
    expect(blocks.delete).not.toHaveBeenCalled();
  });

  it("updateBlock with new start/end mirrors the final pair to the task", async () => {
    const nextStart = "2026-11-04T12:00:00.000Z";
    const nextEnd = "2026-11-04T13:00:00.000Z";
    const updated = blockRow({
      id: "b1",
      task_id: "t1",
      block_type: "task",
      start_time: nextStart,
      end_time: nextEnd,
    });
    const blocks = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    const mirror = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    const result = await updateBlock("b1", { startTime: nextStart, endTime: nextEnd });

    expect(result.startTime).toBe(nextStart);
    expect(result.endTime).toBe(nextEnd);
    expect(mirror.update).toHaveBeenCalledWith({
      scheduled_start: nextStart,
      scheduled_end: nextEnd,
    });
    expect(mirror.eq).toHaveBeenCalledWith("id", "t1");
    expect(mirror.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("updateBlock with only a title leaves tasks untouched", async () => {
    const updated = blockRow({ id: "b1", title: "Renamed" });
    const { builder, update } = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await updateBlock("b1", { title: "Renamed" });

    expect(update).toHaveBeenCalled();
    expect(fromEntry).not.toHaveBeenCalledWith("tasks");
  });

  it("updateBlock with new times on a break block leaves tasks untouched", async () => {
    const nextStart = "2026-11-04T12:00:00.000Z";
    const nextEnd = "2026-11-04T12:30:00.000Z";
    const updated = blockRow({
      id: "b2",
      task_id: null,
      block_type: "break",
      start_time: nextStart,
      end_time: nextEnd,
    });
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await updateBlock("b2", { startTime: nextStart, endTime: nextEnd });

    expect(result.startTime).toBe(nextStart);
    expect(fromEntry).not.toHaveBeenCalledWith("tasks");
  });

  it("updateBlock surfaces the mirror error without hiding the block write", async () => {
    const nextStart = "2026-11-04T12:00:00.000Z";
    const nextEnd = "2026-11-04T13:00:00.000Z";
    const updated = blockRow({
      id: "b1",
      task_id: "t1",
      block_type: "task",
      start_time: nextStart,
      end_time: nextEnd,
    });
    const blocks = mockBuilder(
      { data: null, error: null },
      { data: updated, error: null },
    );
    const mirror = mockBuilder({ data: null, error: { code: "42501", message: "denied" } });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    await expect(
      updateBlock("b1", { startTime: nextStart, endTime: nextEnd }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(blocks.update).toHaveBeenCalled();
    expect(mirror.update).toHaveBeenCalledWith({
      scheduled_start: nextStart,
      scheduled_end: nextEnd,
    });
  });

  it("deleteBlock with a surviving block repoints the mirror instead of nulling it", async () => {
    const survivor = {
      id: "b2",
      start_time: "2026-11-04T14:00:00.000Z",
      end_time: "2026-11-04T15:00:00.000Z",
    };
    const blocks = mockBuilder(
      { data: [survivor], error: null },
      { data: { task_id: "t1" }, error: null },
    );
    const mirror = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    await deleteBlock("b1");

    expect(blocks.neq).toHaveBeenCalledWith("id", "b1");
    expect(blocks.limit).toHaveBeenCalledWith(1);
    expect(mirror.update).toHaveBeenCalledWith({
      scheduled_start: survivor.start_time,
      scheduled_end: survivor.end_time,
    });
    expect(mirror.eq).toHaveBeenCalledWith("id", "t1");
    expect(blocks.delete).toHaveBeenCalledOnce();
  });

  it("deleteBlock with the last block clears the mirror to null", async () => {
    const blocks = mockBuilder(
      { data: [], error: null },
      { data: { task_id: "t1" }, error: null },
    );
    const mirror = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "tasks" ? mirror.builder : blocks.builder,
    );
    stubClient("u1", fromEntry);

    await deleteBlock("b1");

    expect(mirror.update).toHaveBeenCalledWith({ scheduled_start: null, scheduled_end: null });
    expect(blocks.delete).toHaveBeenCalledOnce();
  });

  it("maps CHECK, RLS, auth, duplicate and unknown failures to codes only", async () => {
    const cases: Array<{ raw: unknown; code: string }> = [
      { raw: { code: "23514", message: "violates check constraint" }, code: "validation" },
      { raw: { code: "42501", message: "permission denied" }, code: "forbidden" },
      { raw: { status: 401, message: "invalid token" }, code: "forbidden" },
      { raw: { code: "23505", message: "duplicate key value" }, code: "conflict" },
      { raw: { status: 409, message: "conflict" }, code: "conflict" },
      { raw: { message: "something odd" }, code: "unknown" },
    ];

    for (const { raw, code } of cases) {
      const { builder } = mockBuilder({ data: null, error: raw });
      stubClient("u1", vi.fn().mockReturnValue(builder));
      await expect(listBlocks(RANGE)).rejects.toMatchObject({ code });
    }
  });

  it("keeps raw Postgres text out of user-facing messages", async () => {
    const { builder } = mockBuilder({
      data: null,
      error: { code: "23514", message: 'violates check constraint "time_blocks_no_overlap"' },
    });
    stubClient("u1", vi.fn().mockReturnValue(builder));

    const error = await listBlocks(RANGE).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(BlockServiceError);
    expect(error).toMatchObject({ code: "validation" });
    expect((error as BlockServiceError).message).toBe(BLOCK_ERROR_MESSAGES.validation);
    expect((error as BlockServiceError).message).not.toContain("time_blocks_no_overlap");
  });

  it("validates intervals and links in Zod schemas", () => {
    expect(
      createBlockSchema.safeParse({
        title: "  ",
        startTime: BLOCK_ROW.start_time,
        endTime: BLOCK_ROW.end_time,
        blockType: "personal",
        taskId: null,
      }).success,
    ).toBe(false);

    expect(
      createBlockSchema.safeParse({
        title: "ok",
        startTime: BLOCK_ROW.end_time,
        endTime: BLOCK_ROW.start_time,
        blockType: "personal",
        taskId: null,
      }).success,
    ).toBe(false);

    expect(
      createBlockSchema.safeParse({
        title: "ok",
        startTime: BLOCK_ROW.start_time,
        endTime: BLOCK_ROW.end_time,
        blockType: "task",
        taskId: null,
      }).success,
    ).toBe(false);

    expect(
      createBlockSchema.safeParse({
        title: "ok",
        startTime: BLOCK_ROW.start_time,
        endTime: BLOCK_ROW.end_time,
        blockType: "break",
        taskId: "t1",
      }).success,
    ).toBe(false);

    expect(updateBlockSchema.safeParse({ title: "  Renamed  " }).success).toBe(true);
  });

  it("builds scoped planner query keys", () => {
    expect(planner.all).toEqual(["planner"]);
    expect(planner.blocks).toEqual(["planner", "blocks"]);
    expect(planner.range(RANGE)[0]).toEqual("planner");
    expect(planner.range(RANGE)[1]).toEqual("blocks");
    expect(planner.detail("b1")).toEqual(["planner", "blocks", "detail", "b1"]);
  });
});
