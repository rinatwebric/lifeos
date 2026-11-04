import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ScheduleCard } from "./ScheduleCard";
import {
  useDashboardSchedule,
  type DashboardSchedule,
  type DashboardScheduleBlock,
  type DashboardScheduleViewModel,
} from "./useDashboardSchedule";

/** The card only reads the hook's view model; no request leaves the test. */
vi.mock("./useDashboardSchedule", () => ({
  useDashboardSchedule: vi.fn(),
}));

function makeBlock(overrides: Partial<DashboardScheduleBlock> = {}): DashboardScheduleBlock {
  return {
    id: "block-1",
    blockType: "task",
    title: "Write the report",
    taskId: "task-1",
    start: "2026-11-04T07:00:00.000Z",
    end: "2026-11-04T08:00:00.000Z",
    startLabel: "13:00",
    endLabel: "14:00",
    durationMinutes: 60,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<DashboardSchedule> = {}): DashboardSchedule {
  return {
    blocks: [],
    totals: { task: 0, break: 0, personal: 0, scheduled: 0 },
    dayBlockCount: 0,
    isEmpty: true,
    isAllPast: false,
    ...overrides,
  };
}

function stubSchedule(view: Partial<DashboardScheduleViewModel> = {}): void {
  vi.mocked(useDashboardSchedule).mockReturnValue({
    dateKey: "2026-11-04",
    timeZone: "Asia/Bishkek",
    schedule: makeSchedule(),
    isLoading: false,
    isError: false,
    retry: vi.fn(),
    ...view,
  });
}

function renderCard() {
  return render(
    <MemoryRouter>
      <ScheduleCard now={new Date("2026-11-04T07:00:00.000Z")} />
    </MemoryRouter>,
  );
}

describe("ScheduleCard", () => {
  it("shows a loading state while the day is being read", () => {
    stubSchedule({ isLoading: true });

    renderCard();

    expect(screen.getByRole("status", { name: "Loading today's schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open planner" })).not.toBeInTheDocument();
  });

  it("shows a recoverable error instead of an empty schedule", async () => {
    const retry = vi.fn();
    stubSchedule({ isError: true, retry });
    const user = userEvent.setup();

    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load today's schedule");
    expect(screen.getByText("Check your connection, then try again.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("explains the next step when today has no blocks", () => {
    stubSchedule();

    renderCard();

    expect(screen.getByText("Nothing scheduled today")).toBeInTheDocument();
    expect(
      screen.getByText("Time blocks you plan for today show up here with their times and titles."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open planner" })).toHaveAttribute("href", "/planner");
  });

  it("says the day is over when every block already ended", () => {
    stubSchedule({
      schedule: makeSchedule({ dayBlockCount: 2, isEmpty: false, isAllPast: true }),
    });

    renderCard();

    expect(screen.getByText("Today's blocks are done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open planner" })).toHaveAttribute("href", "/planner");
  });

  it("lists the upcoming blocks with times, type and the day's total", () => {
    stubSchedule({
      schedule: makeSchedule({
        blocks: [
          makeBlock(),
          makeBlock({
            id: "block-2",
            blockType: "break",
            title: "Lunch",
            taskId: null,
            startLabel: "14:30",
            endLabel: "15:00",
            durationMinutes: 30,
          }),
        ],
        totals: { task: 60, break: 30, personal: 0, scheduled: 90 },
        dayBlockCount: 3,
        isEmpty: false,
      }),
    });

    renderCard();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Write the report")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
    expect(screen.getByText("Break")).toBeInTheDocument();
    expect(screen.getByText("Scheduled today")).toBeInTheDocument();
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Task 1 h · Break 30 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open planner" })).toHaveAttribute("href", "/planner");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
