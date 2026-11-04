import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { HabitLogsRow, HabitsRow, HabitScheduleVersionsRow } from "@/types/database";

import {
  createHabit,
  deleteHabit,
  deleteHabitLog,
  getHabit,
  getHabitLog,
  HABIT_PAGE_SIZE,
  listAllHabitVersions,
  listHabitLogs,
  listHabitLogsRange,
  listHabits,
  listHabitVersions,
  logHabit,
  setHabitStatus,
  updateHabit,
  updateHabitLog,
} from "./api";
import { HabitServiceError } from "./errors";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const HABIT_ROW: HabitsRow = {
  id: "h1",
  user_id: "u1",
  title: "Read 20 minutes",
  description: null,
  frequency: "daily",
  weekdays: [],
  target_count: 1,
  reminder_time: null,
  start_date: "2026-11-01",
  status: "active",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

const LOG_ROW: HabitLogsRow = {
  id: "l1",
  user_id: "u1",
  habit_id: "h1",
  log_date: "2026-11-04",
  completed_count: 1,
  note: null,
  created_at: "2026-11-04T08:00:00.000Z",
  updated_at: "2026-11-04T08:00:00.000Z",
};

const UUID_HABIT_ID = "123e4567-e89b-12d3-a456-426614174000";

const VERSION_ROW: HabitScheduleVersionsRow = {
  id: "v1",
  user_id: "u1",
  habit_id: "h1",
  effective_from: "2026-11-01",
  effective_to: null,
  frequency: "daily",
  weekdays: [],
  target_count: 1,
  start_date: "2026-11-01",
  status: "active",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

interface BuilderMocks {
  builder: Record<string, ReturnType<typeof vi.fn>>;
}

function mockBuilder(thenResult: unknown, singleResult?: unknown): BuilderMocks & {
  builder: Record<string, ReturnType<typeof vi.fn>> & {
    then: (onF: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise<unknown>;
  };
} {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const name of [
    "eq",
    "order",
    "range",
    "gte",
    "lte",
    "select",
    "insert",
    "update",
    "upsert",
    "single",
  ]) {
    builder[name] = vi.fn().mockReturnValue(builder);
  }
  builder["delete"] = vi.fn().mockReturnValue(builder);

  (builder["single"] as ReturnType<typeof vi.fn>).mockResolvedValue(singleResult ?? thenResult);

  const withThen = Object.assign(builder, {
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(thenResult).then(onFulfilled, onRejected),
  });

  return { builder: withThen };
}

function stubClient(authUserId: string | null, fromEntry: ReturnType<typeof vi.fn>): void {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: authUserId === null ? null : { user: { id: authUserId } } },
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

describe("habits api identity", () => {
  it("rejects without a session before touching the database", async () => {
    const fromEntry = vi.fn();
    stubClient(null, fromEntry);

    await expect(listHabits()).rejects.toBeInstanceOf(HabitServiceError);
    expect(fromEntry).not.toHaveBeenCalled();
  });
});

describe("listHabits", () => {
  it("returns mapped habits with a single bounded page", async () => {
    const { builder } = mockBuilder({ data: [HABIT_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listHabits();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Read 20 minutes");
    expect(fromEntry).toHaveBeenCalledWith("habits");
  });

  it("pages through the full list instead of silently truncating", async () => {
    const full = Array.from({ length: HABIT_PAGE_SIZE }, (_, i) => ({ ...HABIT_ROW, id: `h${i}` }));
    const range = vi.fn();
    range.mockResolvedValueOnce({ data: full, error: null });
    range.mockResolvedValueOnce({ data: [HABIT_ROW], error: null });

    const builder = { range } as Record<string, ReturnType<typeof vi.fn>>;
    for (const name of ["eq", "order", "select"]) {
      builder[name] = vi.fn().mockReturnValue(builder);
    }
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listHabits();

    expect(range).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(HABIT_PAGE_SIZE + 1);
  });
});

describe("createHabit", () => {
  it("validates input before any network call and sorts weekdays", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: { ...HABIT_ROW, weekdays: [1, 3, 5] }, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(createHabit({ title: "   " } as never)).rejects.toBeInstanceOf(
      HabitServiceError,
    );
    expect(fromEntry).not.toHaveBeenCalled();

    const created = await createHabit({
      title: "Read",
      description: null,
      frequency: "weekdays",
      weekdays: [5, 1, 3],
      targetCount: 1,
      reminderTime: null,
      startDate: "2026-11-05",
      status: "active",
    });

    expect(created.weekdays).toStrictEqual([1, 3, 5]);
    expect(builder["insert"]).toHaveBeenCalledOnce();
    const payload = (builder["insert"] as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.weekdays).toStrictEqual([1, 3, 5]);
    expect(payload.user_id).toBe("u1");
    expect("userId" in payload).toBe(false);
  });
});

describe("updateHabit", () => {
  function storedRow(overrides: Partial<HabitsRow> = {}): HabitsRow {
    return { ...HABIT_ROW, ...overrides };
  }

  it("rejects an empty weekday list against a stored weekdays frequency", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: storedRow({ frequency: "weekdays", weekdays: [1, 3] }), error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(updateHabit("h1", { weekdays: [] })).rejects.toBeInstanceOf(HabitServiceError);
    expect(builder["update"]).not.toHaveBeenCalled();
  });

  it("rejects switching to weekdays without an explicit day list", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: storedRow(), error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await expect(updateHabit("h1", { frequency: "weekdays" })).rejects.toBeInstanceOf(
      HabitServiceError,
    );
    expect(builder["update"]).not.toHaveBeenCalled();
  });

  it("returns the stored habit when the patch is empty", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: storedRow(), error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await updateHabit("h1", {});

    expect(result.id).toBe("h1");
    expect(builder["update"]).not.toHaveBeenCalled();
  });
});

describe("setHabitStatus", () => {
  it("pauses the habit (logs stay, status flips, history snapshot is written by the DB trigger)", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: { ...HABIT_ROW, status: "paused" }, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await setHabitStatus("h1", "paused");

    expect(result.status).toBe("paused");
    expect(builder["update"]).toHaveBeenCalledOnce();
  });
});

describe("getHabit and deleteHabit", () => {
  it("scopes reads and deletes to the owner", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: HABIT_ROW, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await getHabit("h1");
    await deleteHabit("h1");

    expect(fromEntry).toHaveBeenCalledWith("habits");
    expect(builder["delete"]).toHaveBeenCalledOnce();
  });
});

describe("logHabit", () => {
  it("writes through upsert on (habit_id, log_date): repeats never duplicate", async () => {
    const habitBuilder = mockBuilder(
      { data: null, error: null },
      { data: { id: "h1" }, error: null },
    );
    const logBuilder = mockBuilder(
      { data: null, error: null },
      { data: LOG_ROW, error: null },
    );
    const fromEntry = vi.fn((table: string) =>
      table === "habits" ? habitBuilder.builder : logBuilder.builder,
    );
    stubClient("u1", fromEntry);

    const first = await logHabit({ habitId: UUID_HABIT_ID, logDate: "2026-11-04", completedCount: 1 });
    const second = await logHabit({ habitId: UUID_HABIT_ID, logDate: "2026-11-04", completedCount: 2 });

    expect(first.logDate).toBe("2026-11-04");
    expect(second.logDate).toBe("2026-11-04");
    expect(logBuilder.builder["upsert"]).toHaveBeenCalledTimes(2);
    for (const call of (logBuilder.builder["upsert"] as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toMatchObject({ onConflict: "habit_id,log_date" });
    }
  });

  it("validates counts before any network call", async () => {
    const fromEntry = vi.fn();
    stubClient("u1", fromEntry);

    await expect(
      logHabit({ habitId: UUID_HABIT_ID, logDate: "2026-11-04", completedCount: -1 }),
    ).rejects.toBeInstanceOf(HabitServiceError);
    expect(fromEntry).not.toHaveBeenCalled();
  });

  it("rejects a foreign habit id without writing a log", async () => {
    const habitBuilder = mockBuilder(
      { data: null, error: { code: "PGRST116", message: "no rows" } },
      { data: null, error: { code: "PGRST116", message: "no rows" } },
    );
    const logBuilder = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn((table: string) =>
      table === "habits" ? habitBuilder.builder : logBuilder.builder,
    );
    stubClient("u1", fromEntry);

    await expect(
      logHabit({ habitId: "00000000-0000-4000-8000-000000000000", logDate: "2026-11-04", completedCount: 1 }),
    ).rejects.toBeInstanceOf(HabitServiceError);
    expect(logBuilder.builder["upsert"]).not.toHaveBeenCalled();
  });
});

describe("updateHabitLog", () => {
  it("updates count and note scoped to the owner", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: { ...LOG_ROW, completed_count: 3, note: "Evening run." }, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await updateHabitLog("l1", { completedCount: 3, note: "Evening run." });

    expect(result.completedCount).toBe(3);
    expect(result.note).toBe("Evening run.");
    expect(builder["update"]).toHaveBeenCalledOnce();
  });
});

describe("deleteHabitLog", () => {
  it("deletes scoped to the owner", async () => {
    const { builder } = mockBuilder({ data: null, error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    await deleteHabitLog("l1");

    expect(builder["delete"]).toHaveBeenCalledOnce();
  });
});

describe("listHabitLogs and listHabitLogsRange", () => {
  it("reads one habit's logs ordered by date, full range", async () => {
    const { builder } = mockBuilder({ data: [LOG_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listHabitLogs("h1", { from: "2026-11-01", to: "2026-11-30" });

    expect(result).toHaveLength(1);
    expect(builder["order"]).toHaveBeenCalledWith("log_date", expect.anything());
  });

  it("reads all habits' logs in a range with a single paginated query shape", async () => {
    const { builder } = mockBuilder({ data: [LOG_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listHabitLogsRange({ from: "2026-11-01", to: "2026-11-30" });

    expect(result).toHaveLength(1);
    expect(builder["gte"]).toHaveBeenCalledWith("log_date", "2026-11-01");
    expect(builder["lte"]).toHaveBeenCalledWith("log_date", "2026-11-30");
  });
});

describe("listHabitVersions", () => {
  it("returns mapped snapshots ordered by effective date", async () => {
    const { builder } = mockBuilder({ data: [VERSION_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listHabitVersions("h1");

    expect(result).toHaveLength(1);
    expect(result[0].effectiveFrom).toBe("2026-11-01");
    expect(builder["order"]).toHaveBeenCalledWith("effective_from", expect.anything());
  });

  it("reads every habit's snapshots in one query for stats (no N+1)", async () => {
    const { builder } = mockBuilder({ data: [VERSION_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await listAllHabitVersions();

    expect(result).toHaveLength(1);
    expect(builder["eq"]).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("getHabitLog", () => {
  it("reads a single log scoped to the owner", async () => {
    const { builder } = mockBuilder(
      { data: null, error: null },
      { data: LOG_ROW, error: null },
    );
    const fromEntry = vi.fn().mockReturnValue(builder);
    stubClient("u1", fromEntry);

    const result = await getHabitLog("l1");

    expect(result.logDate).toBe("2026-11-04");
  });
});
