import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyPlan } from "./api";
import { useApplyPlan } from "./hooks";
import { planner } from "./queryKeys";

vi.mock("./api", () => ({
  applyPlan: vi.fn(),
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  listBlocks: vi.fn(),
  updateBlock: vi.fn(),
}));

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useApplyPlan", () => {
  it("writes through the service and refreshes planner ranges plus linked tasks", async () => {
    const client = createClient();
    vi.mocked(applyPlan).mockResolvedValue({ blocks: [], mirroredTaskIds: [TASK_ID] });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useApplyPlan(), { wrapper: wrapper(client) });

    result.current.mutate({
      slots: [
        {
          taskId: TASK_ID,
          title: "Write the report",
          start: "2026-11-04T08:00:00.000Z",
          end: "2026-11-04T09:00:00.000Z",
        },
      ],
    });

    await waitFor(() => {
      expect(applyPlan).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: planner.blocks });
    });

    // The day/week ranges refresh; the linked task detail and lists refresh.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks", "detail", TASK_ID] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks", "list"] });
  });

  it("never touches the goals list", async () => {
    const client = createClient();
    vi.mocked(applyPlan).mockResolvedValue({ blocks: [], mirroredTaskIds: [TASK_ID] });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useApplyPlan(), { wrapper: wrapper(client) });

    result.current.mutate({ slots: [] });

    await waitFor(() => {
      expect(applyPlan).toHaveBeenCalledTimes(1);
    });

    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]).not.toEqual({ queryKey: ["goals", "list"] });
    }
  });

  it("surfaces the coded service error to the caller", async () => {
    const client = createClient();
    vi.mocked(applyPlan).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "forbidden" }),
    );

    const { result } = renderHook(() => useApplyPlan(), { wrapper: wrapper(client) });

    let failure: unknown = null;
    await result.current.mutateAsync({ slots: [] }).catch((error: unknown) => {
      failure = error;
    });

    expect(failure).toMatchObject({ code: "forbidden" });
  });
});
