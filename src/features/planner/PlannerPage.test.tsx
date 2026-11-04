import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProfile } from "@/features/settings/api";
import { localDateTimeToIso } from "@/lib/dates";
import type { TimeBlock } from "@/types/domain";

import { PlannerPage } from "./PlannerPage";
import { buildPlannerDay, usePlannerDay } from "./usePlannerDay";
import type * as PlannerDayModule from "./usePlannerDay";
import { buildPlannerWeek, usePlannerWeek } from "./usePlannerWeek";
import type * as PlannerWeekModule from "./usePlannerWeek";

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
  getPreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

vi.mock("./usePlannerDay", async (importOriginal) => {
  const actual = await importOriginal<typeof PlannerDayModule>();

  return { ...actual, usePlannerDay: vi.fn() };
});

vi.mock("./usePlannerWeek", async (importOriginal) => {
  const actual = await importOriginal<typeof PlannerWeekModule>();

  return { ...actual, usePlannerWeek: vi.fn() };
});

const TIME_ZONE = "UTC";
const DATE_KEY = "2026-11-04";
const NEXT_DATE_KEY = "2026-11-05";
const NOW = new Date("2026-11-04T08:00:00.000Z");
const TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

function at(local: string, dateKey = DATE_KEY): string {
  return localDateTimeToIso(`${dateKey}T${local}`, TIME_ZONE);
}

const BLOCKS: TimeBlock[] = [
  {
    id: "task-1",
    userId: "user-1",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    taskId: TASK_ID,
    title: "Report block",
    blockType: "task",
    startTime: at("09:00"),
    endTime: at("10:30"),
  },
];

const DAY = buildPlannerDay({
  blocks: BLOCKS,
  dateKey: DATE_KEY,
  timeZone: TIME_ZONE,
  now: NOW,
  wakeUpTime: "07:00",
  sleepTime: "23:00",
});

const WEEK = buildPlannerWeek({
  blocks: BLOCKS,
  dateKey: DATE_KEY,
  timeZone: TIME_ZONE,
  now: NOW,
  wakeUpTime: "07:00",
  sleepTime: "23:00",
});

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="search">{location.search}</div>;
}

function renderPage(entry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <PlannerPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getProfile).mockResolvedValue({
    timezone: TIME_ZONE,
  } as unknown as Awaited<ReturnType<typeof getProfile>>);
  vi.mocked(usePlannerDay).mockReturnValue({
    day: DAY,
    timeZone: TIME_ZONE,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  });
  vi.mocked(usePlannerWeek).mockReturnValue({
    week: WEEK,
    timeZone: TIME_ZONE,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  });
});

describe("PlannerPage view switch", () => {
  it("opens on the day view and marks it as the current view", () => {
    renderPage(`/planner?view=day&date=${DATE_KEY}`);

    expect(screen.getByText("Day summary")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Planner view" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Day" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Week" })).not.toHaveAttribute("aria-current");
    expect(usePlannerWeek).not.toHaveBeenCalled();
  });

  it("writes the view into the URL when the user switches to the week", async () => {
    const user = userEvent.setup();
    renderPage(`/planner?view=day&date=${DATE_KEY}`);

    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      `/planner?view=week&date=${DATE_KEY}`,
    );

    await user.click(screen.getByRole("link", { name: "Week" }));

    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent(`?view=week&date=${DATE_KEY}`);
    });
    expect(screen.getByText("Week summary")).toBeInTheDocument();
    expect(screen.queryByText("Day summary")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the day navigation and steps a week in week mode", async () => {
    const user = userEvent.setup();
    renderPage(`/planner?view=day&date=${DATE_KEY}`);

    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent(`?view=day&date=${NEXT_DATE_KEY}`);
    });
    expect(usePlannerDay).toHaveBeenLastCalledWith({
      dateKey: NEXT_DATE_KEY,
      now: expect.any(Date),
    });

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent(`?view=day&date=${DATE_KEY}`);
    });

    await user.click(screen.getByRole("link", { name: "Week" }));
    await user.click(screen.getByRole("button", { name: "Next week" }));

    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent("?view=week&date=2026-11-11");
    });
  });

  it("reads the view from a direct link without loading the other view", () => {
    renderPage(`/planner?view=week&date=${DATE_KEY}`);

    expect(screen.getByText("Week summary")).toBeInTheDocument();
    expect(screen.queryByText("Day summary")).not.toBeInTheDocument();
    expect(usePlannerWeek).toHaveBeenCalledWith({ dateKey: DATE_KEY, now: expect.any(Date) });
    expect(usePlannerDay).not.toHaveBeenCalled();
  });

  it("opens the day view of a day clicked in the week grid", async () => {
    const user = userEvent.setup();
    renderPage(`/planner?view=week&date=${DATE_KEY}`);

    await user.click(screen.getByRole("link", { name: /Open Friday, Nov 6/ }));

    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent("?view=day&date=2026-11-06");
    });
    expect(screen.getByText("Day summary")).toBeInTheDocument();
    expect(usePlannerDay).toHaveBeenLastCalledWith({
      dateKey: "2026-11-06",
      now: expect.any(Date),
    });
  });
});
