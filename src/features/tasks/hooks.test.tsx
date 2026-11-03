import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { goals } from "@/features/goals/queryKeys";
import type { Task } from "@/types/domain";

import {
  createTask,
  deleteTask,
  rescheduleTask,
  setTaskStatus,
  updateTask,
} from "./api";
import {
  useCreateTask,
  useDeleteTask,
  useRescheduleTask,
  useSetTaskStatus,
  useUpdateTask,
} from "./hooks";
import { tasks } from "./queryKeys";

vi.mock("./api", () => ({
  countTasksForGoal: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  rescheduleTask: vi.fn(),
  setTaskStatus: vi.fn(),
  updateTask: vi.fn(),
}));

const mockedCreateTask = vi.mocked(createTask);
const mockedUpdateTask = vi.mocked(updateTask);
const mockedSetTaskStatus = vi.mocked(setTaskStatus);
const mockedRescheduleTask = vi.mocked(rescheduleTask);
const mockedDeleteTask = vi.mocked(deleteTask);

const TASK: Task = {
  id: "t1",
  userId: "u1",
  goalId: "g1",
  milestoneId: null,
  title: "Write report",
  description: null,
  priority: "medium",
  status: "todo",
  dueDate: "2026-11-10",
  scheduledStart: null,
  scheduledEnd: null,
  estimatedDurationMinutes: null,
  completedAt: null,
  recurrenceRuleId: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tasks mutations", () => {
  it("useCreateTask refreshes every list and the goal task-count", async () => {
    mockedCreateTask.mockResolvedValue({ ...TASK });
    const queryClient = createClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({
      title: "Write report",
      priority: "medium",
      status: "todo",
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    expect(spy).toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
  });

  it("useCreateTask without a goal does not touch any task-count key", async () => {
    mockedCreateTask.mockResolvedValue({ ...TASK, goalId: null });
    const queryClient = createClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({
      title: "Solo",
      priority: "low",
      status: "todo",
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    expect(spy).not.toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
  });

  it("useUpdateTask refreshes the detail, every list and the goal task-count", async () => {
    mockedUpdateTask.mockResolvedValue({ ...TASK, title: "Renamed" });
    const queryClient = createClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: "t1", patch: { title: "Renamed" } });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.detail("t1") });
    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    expect(spy).toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
  });

  it("useRescheduleTask refreshes the detail and lists but not the goal task-count", async () => {
    mockedRescheduleTask.mockResolvedValue({ ...TASK, dueDate: "2026-12-01" });
    const queryClient = createClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRescheduleTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: "t1", dueDate: "2026-12-01" });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.detail("t1") });
    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    // A due-date move never changes the goal link, so the count stays stale-free.
    expect(spy).not.toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
  });

  it("useDeleteTask invalidates the task-count from the passed goalId, not the cache", async () => {
    mockedDeleteTask.mockResolvedValue(undefined);
    const queryClient = createClient();
    // No cached detail on purpose: the caller passes the goal through.
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: "t1", goalId: "g1" });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    expect(spy).toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
    expect(queryClient.getQueryData(tasks.detail("t1"))).toBeUndefined();
  });

  it("useDeleteTask without a goal does not touch any task-count key", async () => {
    mockedDeleteTask.mockResolvedValue(undefined);
    const queryClient = createClient();
    queryClient.setQueryData<Task>(tasks.detail("t1"), { ...TASK, goalId: null });
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTask(), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: "t1", goalId: null });

    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    expect(spy).not.toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
    expect(queryClient.getQueryData(tasks.detail("t1"))).toBeUndefined();
  });

  it("useSetTaskStatus applies the toggle optimistically and refreshes on settle", async () => {
    mockedSetTaskStatus.mockResolvedValue({ ...TASK, status: "completed" });
    const queryClient = createClient();
    queryClient.setQueryData<Task[]>(tasks.list({}), [{ ...TASK }]);
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSetTaskStatus(), {
      wrapper: createWrapper(queryClient),
    });
    result.current.mutate({ id: "t1", status: "completed" });

    await waitFor(() => {
      expect(queryClient.getQueryData<Task[]>(tasks.list({}))?.[0]).toMatchObject({
        status: "completed",
        completedAt: expect.any(String),
      });
    });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: tasks.detail("t1") });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: tasks.lists });
    // A status flip never changes the goal link, so the count stays stale-free.
    expect(spy).not.toHaveBeenCalledWith({
      queryKey: [...goals.detail("g1"), "task-count"],
    });
  });

  it("useSetTaskStatus rolls the toggle back when the server rejects", async () => {
    mockedSetTaskStatus.mockRejectedValue(new Error("offline"));
    const queryClient = createClient();
    queryClient.setQueryData<Task[]>(tasks.list({}), [{ ...TASK }]);

    const { result } = renderHook(() => useSetTaskStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ id: "t1", status: "completed" }),
    ).rejects.toThrow("offline");

    await waitFor(() => {
      expect(queryClient.getQueryData<Task[]>(tasks.list({}))?.[0]).toMatchObject({
        status: "todo",
        completedAt: null,
      });
    });
  });
});
