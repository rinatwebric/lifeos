import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { FocusCard } from "./FocusCard";
import {
  useActiveFocusSession,
  useCompleteFocusSession,
  usePauseFocusSession,
  useResumeFocusSession,
  useStartFocusSession,
} from "./hooks";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import type { Task } from "@/types/domain";

vi.mock("./hooks", () => ({
  useActiveFocusSession: vi.fn(),
  useStartFocusSession: vi.fn(),
  usePauseFocusSession: vi.fn(),
  useResumeFocusSession: vi.fn(),
  useCompleteFocusSession: vi.fn(),
}));

vi.mock("@/features/tasks/hooks", () => ({
  useSetTaskStatus: vi.fn(),
}));

const mockListTasks = vi.hoisted(() => vi.fn());
vi.mock("@/features/tasks/api", () => ({
  listTasks: mockListTasks,
}));

const mockedActive = vi.mocked(useActiveFocusSession);
const mockedStart = vi.mocked(useStartFocusSession);
const mockedPause = vi.mocked(usePauseFocusSession);
const mockedResume = vi.mocked(useResumeFocusSession);
const mockedComplete = vi.mocked(useCompleteFocusSession);
const mockedStatus = vi.mocked(useSetTaskStatus);

const NOW = Date.now();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title: "Write the outline",
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: null,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "fs-1",
    userId: "u1",
    taskId: "task-1",
    taskTitle: "Write the outline",
    startedAt: new Date(NOW - 65_000).toISOString(),
    endedAt: null,
    plannedMinutes: 25,
    pausedAt: null,
    pausedSeconds: 0,
    createdAt: new Date(NOW - 65_000).toISOString(),
    updatedAt: new Date(NOW - 65_000).toISOString(),
    ...overrides,
  };
}

function renderCard(nextTask: Task | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FocusCard nextTask={nextTask} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubMutations() {
  const start = vi.fn().mockResolvedValue(makeSession());
  const pause = vi.fn().mockResolvedValue(makeSession({ pausedAt: new Date().toISOString() }));
  const resume = vi.fn().mockResolvedValue(makeSession());
  const complete = vi.fn().mockResolvedValue(makeSession({ endedAt: new Date().toISOString() }));
  mockedStart.mockReturnValue({
    mutateAsync: start,
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useStartFocusSession>);
  mockedPause.mockReturnValue({
    mutateAsync: pause,
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof usePauseFocusSession>);
  mockedResume.mockReturnValue({
    mutateAsync: resume,
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useResumeFocusSession>);
  mockedComplete.mockReturnValue({
    mutateAsync: complete,
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useCompleteFocusSession>);
  return { start, pause, resume, complete };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedActive.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useActiveFocusSession>);
  mockedStatus.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSetTaskStatus>);
  stubMutations();
});

describe("FocusCard", () => {
  it("shows the task picker when nothing is selected", async () => {
    const user = userEvent.setup();
    mockListTasks.mockResolvedValue([makeTask({ id: "task-2", title: "Walk", dueDate: null })]);
    renderCard(null);

    expect(screen.getByText("No task selected for focus")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose a task" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Walk/ }));

    expect(screen.getByText("Walk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start 25 min" })).toBeInTheDocument();
  });

  it("starts the selected focus length on the next task", async () => {
    const user = userEvent.setup();
    const { start } = stubMutations();
    renderCard(makeTask());

    expect(screen.getByText("Write the outline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "50 min" }));
    await user.click(screen.getByRole("button", { name: "Start 50 min" }));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({ taskId: "task-1", plannedMinutes: 50 });
    });
  });

  it("shows a running session, pauses and completes it", async () => {
    const user = userEvent.setup();
    mockedActive.mockReturnValue({
      data: makeSession(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useActiveFocusSession>);
    const { pause, complete } = stubMutations();
    renderCard(makeTask());

    expect(screen.getByText("Focus running")).toBeInTheDocument();
    expect(screen.getByText("Write the outline")).toBeInTheDocument();
    expect(screen.getByText(/^01:0[4-6]$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(pause).toHaveBeenCalledWith("fs-1"));

    await user.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("fs-1"));
  });

  it("resumes a paused session", async () => {
    const user = userEvent.setup();
    mockedActive.mockReturnValue({
      data: makeSession({
        pausedAt: new Date(NOW - 10_000).toISOString(),
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useActiveFocusSession>);
    const { resume } = stubMutations();
    renderCard(makeTask());

    expect(screen.getByText("Paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith("fs-1"));
  });
});
