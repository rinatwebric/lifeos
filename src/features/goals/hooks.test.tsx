import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUpdateMilestone } from "./hooks";

vi.mock("./api", () => ({
  countTasksForGoal: vi.fn(),
  createGoal: vi.fn(),
  createMilestone: vi.fn(),
  deleteGoal: vi.fn(),
  deleteMilestone: vi.fn(),
  getGoal: vi.fn(),
  listAllMilestones: vi.fn(),
  listGoals: vi.fn(),
  listMilestones: vi.fn(),
  reorderMilestones: vi.fn(),
  updateGoal: vi.fn(),
  updateMilestone: vi.fn().mockResolvedValue({
    id: "m1",
    userId: "u1",
    goalId: "g1",
    title: "Step",
    description: null,
    position: 0,
    status: "completed",
    targetDate: null,
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("milestone mutation invalidations", () => {
  it("invalidates the goal list and all-milestones after useUpdateMilestone", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMilestone(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      id: "m1",
      goalId: "g1",
      patch: { status: "completed" },
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["goals", "list"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["goals", "milestones", "all"] });
  });
});
