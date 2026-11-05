import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";
import type { TimeBlock } from "@/types/domain";

import { WeekView } from "./WeekView";
import { buildPlannerWeek, type PlannerWeek } from "./usePlannerWeek";

const TIME_ZONE = "Europe/Berlin";
const WEEK_DATE = "2026-11-04";
const NOW = new Date("2026-11-04T05:00:00.000Z");
const TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

function at(local: string, dateKey = WEEK_DATE): string {
  return localDateTimeToIso(`${dateKey}T${local}`, TIME_ZONE);
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

function buildWeek(blocks: TimeBlock[] = []): PlannerWeek {
  return buildPlannerWeek({
    blocks,
    dateKey: WEEK_DATE,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
  });
}

const EMPTY_WEEK = buildWeek();

const BUSY_WEEK = buildWeek([
  makeBlock({
    id: "task-1",
    blockType: "task",
    taskId: TASK_ID,
    startTime: at("09:00", "2026-11-02"),
    endTime: at("10:30", "2026-11-02"),
  }),
  makeBlock({ id: "long", startTime: at("09:00"), endTime: at("10:30") }),
  makeBlock({ id: "inside", blockType: "break", startTime: at("10:00"), endTime: at("10:15") }),
  makeBlock({
    id: "personal-1",
    title: "Walk",
    startTime: at("12:00", "2026-11-06"),
    endTime: at("13:00", "2026-11-06"),
  }),
]);

function renderWeek(week: PlannerWeek, overrides: Partial<Parameters<typeof WeekView>[0]> = {}) {
  return render(
    <MemoryRouter>
      <WeekView
        week={week}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        dayHref={(dateKey) => `/planner?view=day&date=${dateKey}`}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("WeekView", () => {
  it("shows a loading status and keeps the empty state away", () => {
    renderWeek(EMPTY_WEEK, { isLoading: true });

    expect(screen.getByRole("status", { name: "Loading the week…" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing planned for this week")).not.toBeInTheDocument();
    expect(screen.queryByText("Week summary")).not.toBeInTheDocument();
  });

  it("shows a recoverable error and retries on demand", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    renderWeek(EMPTY_WEEK, { isError: true, onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this week");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The blocks for this week did not load. Check your connection, then try again.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("explains the next step on an empty week", () => {
    renderWeek(EMPTY_WEEK, { emptyAction: <a href="/tasks">Open tasks</a> });

    expect(screen.getByText("Nothing planned for this week")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Time blocks appear here once they are scheduled. Open your tasks and choose what to work on next, then come back to see the week fill up.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open tasks" })).toHaveAttribute("href", "/tasks");
  });

  it("lists seven days, each with its minutes, blocks and a link to the day view", () => {
    renderWeek(BUSY_WEEK);

    expect(screen.getByText("Week summary")).toBeInTheDocument();
    expect(screen.getByText("Planned days")).toBeInTheDocument();
    expect(screen.getByText("3 of 7")).toBeInTheDocument();
    expect(screen.getByText("4 h 15 min")).toBeInTheDocument();

    const monday = screen.getByRole("link", { name: "Open Monday, Nov 2" });
    expect(monday).toHaveAttribute("href", "/planner?view=day&date=2026-11-02");
    // The tile total and the task row both hold the same 90 minutes.
    expect(within(monday).getAllByText("1 h 30 min")).toHaveLength(2);
    expect(within(monday).getByText("1 block")).toBeInTheDocument();
    expect(within(monday).getByText("Task")).toBeInTheDocument();

    const wednesday = screen.getByRole("link", {
      name: "Open Wednesday, Nov 4 (today, has a conflict)",
    });
    expect(within(wednesday).getByText("Today")).toBeInTheDocument();
    expect(within(wednesday).getByText("2 blocks")).toBeInTheDocument();
    expect(within(wednesday).getByText("Conflict")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Open Friday, Nov 6" })).toHaveAttribute(
      "href",
      "/planner?view=day&date=2026-11-06",
    );
    expect(screen.getAllByRole("link")).toHaveLength(7);
    // Days without blocks say so instead of showing a zero.
    expect(screen.getAllByText("Nothing planned")).toHaveLength(4);
    expect(screen.getAllByText("Conflict")).toHaveLength(1);
    expect(
      screen.getByText(
        "One day has blocks that share the same time or reach outside your waking hours. They are marked below.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Times shown in Europe\/Berlin/)).toBeInTheDocument();
  });
});
