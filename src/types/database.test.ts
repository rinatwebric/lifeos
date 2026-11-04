import { describe, expect, it } from "vitest";

import { mapTimeBlockRowToTimeBlock, type TimeBlocksRow } from "@/types/database";

describe("mapTimeBlockRowToTimeBlock", () => {
  it("maps a task block, keeping the task link and ISO date strings", () => {
    const row: TimeBlocksRow = {
      id: "block-1",
      user_id: "user-1",
      task_id: "task-1",
      title: "Deep work",
      start_time: "2026-11-05T09:00:00.000Z",
      end_time: "2026-11-05T10:00:00.000Z",
      block_type: "task",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
    };

    expect(mapTimeBlockRowToTimeBlock(row)).toStrictEqual({
      id: "block-1",
      userId: "user-1",
      taskId: "task-1",
      title: "Deep work",
      startTime: "2026-11-05T09:00:00.000Z",
      endTime: "2026-11-05T10:00:00.000Z",
      blockType: "task",
      createdAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
  });

  it("maps a personal block without a task link", () => {
    const row: TimeBlocksRow = {
      id: "block-2",
      user_id: "user-1",
      task_id: null,
      title: "Evening walk",
      start_time: "2026-11-05T18:00:00.000Z",
      end_time: "2026-11-05T18:30:00.000Z",
      block_type: "personal",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
    };

    const mapped = mapTimeBlockRowToTimeBlock(row);

    expect(mapped.taskId).toBeNull();
    expect(mapped.blockType).toBe("personal");
    expect(mapped.startTime).toBe(row.start_time);
    expect(mapped.endTime).toBe(row.end_time);
  });
});
