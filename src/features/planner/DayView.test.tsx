import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";
import type { TimeBlock } from "@/types/domain";

import { DayView } from "./DayView";
import { buildPlannerDay, type PlannerDay } from "./usePlannerDay";

const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-04T05:00:00.000Z");
const TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

function at(local: string): string {
  return localDateTimeToIso(`${DATE_KEY}T${local}`, TIME_ZONE);
}

function makeBlock(
  overrides: Partial<TimeBlock> & Pick<TimeBlock, "id" | "startTime" | "endTime">,
): TimeBlock {
  return {
    userId: "user-1",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    taskId: null,
    title: "Block",
    blockType: "personal",
    ...overrides,
  };
}

function buildDay(blocks: TimeBlock[], sleepTime = "23:00"): PlannerDay {
  return buildPlannerDay({
    blocks,
    dateKey: DATE_KEY,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime,
    workingHours: {},
    studyHours: {},
    taskTitleById: new Map([[TASK_ID, "Write the report"]]),
  });
}

const EMPTY_DAY = buildDay([]);

const BUSY_DAY = buildDay([
  makeBlock({
    id: "task-1",
    blockType: "task",
    taskId: TASK_ID,
    title: "Report block",
    startTime: at("09:00"),
    endTime: at("10:30"),
  }),
  makeBlock({
    id: "break-1",
    blockType: "break",
    title: "Coffee",
    startTime: at("10:00"),
    endTime: at("10:15"),
  }),
]);

function renderDay(day: PlannerDay, overrides: Partial<Parameters<typeof DayView>[0]> = {}) {
  return render(
    <DayView day={day} isLoading={false} isError={false} onRetry={vi.fn()} {...overrides} />,
  );
}
describe("DayView", () => {
  it("shows a loading status and keeps the empty state away", () => {
    renderDay(EMPTY_DAY, { isLoading: true });

    expect(screen.getByRole("status", { name: "Loading the day" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing planned for this day")).not.toBeInTheDocument();
    expect(screen.queryByText("Day summary")).not.toBeInTheDocument();
  });

  it("shows a recoverable error and retries on demand", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    renderDay(EMPTY_DAY, { isError: true, onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this day");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The blocks for this day did not load. Check your connection, then try again.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("explains the next step on an empty day", () => {
    renderDay(EMPTY_DAY, { emptyAction: <a href="/tasks">Open tasks</a> });

    expect(screen.getByText("Nothing planned for this day")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Time blocks appear here once they are scheduled. In the meantime, open your tasks and choose what to work on next.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open tasks" })).toHaveAttribute("href", "/tasks");
    expect(screen.queryByText("Day summary")).not.toBeInTheDocument();
  });

  it("lists the blocks with local times, types, durations and conflict markers", () => {
    renderDay(BUSY_DAY);

    expect(screen.getByText("Day summary")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("2 blocks")).toBeInTheDocument();
    expect(screen.getByText(/Times shown in Europe\/Berlin/)).toBeInTheDocument();

    const taskRow = screen.getByText("Write the report").closest("li");
    expect(taskRow).not.toBeNull();

    const task = within(taskRow as HTMLElement);
    expect(task.getByText("09:00")).toBeInTheDocument();
    expect(task.getByText("10:30")).toBeInTheDocument();
    expect(task.getByText("Task")).toBeInTheDocument();
    expect(task.getByText("1 h 30 min")).toBeInTheDocument();
    expect(task.getByText("Overlaps")).toBeInTheDocument();

    const breakRow = screen.getByText("Coffee").closest("li");
    expect(breakRow).not.toBeNull();
    expect(within(breakRow as HTMLElement).getByText("Break")).toBeInTheDocument();
    expect(within(breakRow as HTMLElement).getByText("15 min")).toBeInTheDocument();

    expect(screen.getByText("Check the schedule")).toBeInTheDocument();
    expect(
      screen.getByText("Some blocks share the same time. They are marked below."),
    ).toBeInTheDocument();
  });

  it("totals the day per block type and lists the free windows", () => {
    renderDay(BUSY_DAY);

    const summary = screen.getByText("Day summary").closest("section");
    expect(summary).not.toBeNull();

    const stats = within(summary as HTMLElement);
    expect(stats.getByText("Scheduled")).toBeInTheDocument();
    expect(stats.getByText("1 h 45 min")).toBeInTheDocument();
    expect(stats.getByText("1 h 30 min")).toBeInTheDocument();
    expect(stats.getByText("15 min")).toBeInTheDocument();
    expect(stats.getByText("0 min")).toBeInTheDocument();
    expect(stats.getByText("14 h 30 min")).toBeInTheDocument();

    expect(screen.getByText("07:00 – 09:00")).toBeInTheDocument();
    expect(screen.getByText("10:30 – 23:00")).toBeInTheDocument();
  });
  it("marks a block that reaches outside the waking hours", () => {
    const lateDay = buildDay(
      [
        makeBlock({
          id: "late",
          title: "Late review",
          startTime: at("23:15"),
          endTime: at("23:45"),
        }),
      ],
      "23:00",
    );

    renderDay(lateDay);

    const row = screen.getByText("Late review").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Outside waking hours")).toBeInTheDocument();
    expect(
      screen.getByText("Some blocks sit outside your waking hours. They are marked below."),
    ).toBeInTheDocument();
    // A block outside the waking hours does not eat into the free window.
    expect(screen.getByText("07:00 – 23:00")).toBeInTheDocument();
  });

  it("says when no free time is left on the day", () => {
    const fullDay = buildDay([
      makeBlock({
        id: "full",
        title: "Deep work",
        startTime: at("07:00"),
        endTime: at("23:00"),
      }),
    ]);

    renderDay(fullDay);

    expect(
      screen.getByText(
        "No free time left on this day. Your blocks fill every window between wake-up and sleep.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that free time needs waking hours", () => {
    const unknown = buildPlannerDay({
      blocks: [
        makeBlock({
          id: "task-1",
          blockType: "task",
          taskId: TASK_ID,
          startTime: at("09:00"),
          endTime: at("10:00"),
        }),
      ],
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      now: NOW,
      wakeUpTime: null,
      sleepTime: null,
    });

    renderDay(unknown);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Free time is calculated from your waking hours. Set your wake-up and sleep time in Settings to see the free windows for this day.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No free time left on this day. Your blocks fill every window between wake-up and sleep.",
      ),
    ).not.toBeInTheDocument();
  });

  it("opens the editor when a block row is activated", async () => {
    const onEditBlock = vi.fn();
    const user = userEvent.setup();

    renderDay(BUSY_DAY, { onEditBlock });

    const row = screen.getByRole("button", {
      name: "Edit Write the report, 09:00 to 10:30",
    });
    await user.click(row);

    expect(onEditBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", taskId: TASK_ID, start: at("09:00") }),
    );
  });

  it("keeps the rows static when no editor is wired", () => {
    renderDay(BUSY_DAY);

    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.getByText("Write the report")).toBeInTheDocument();
  });
});
