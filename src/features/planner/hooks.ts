import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { tasks } from "@/features/tasks/queryKeys";
import type { TimeBlock } from "@/types/domain";

import {
  applyPlan,
  createBlock,
  deleteBlock,
  listBlocks,
  updateBlock,
  type ApplyPlanResult,
  type BlockRange,
} from "./api";
import type { ApplyPlanInput } from "./schemas";
import { planner } from "./queryKeys";
import type { CreateBlockInput, UpdateBlockInput } from "./schemas";

export function useBlocks(range: BlockRange) {
  return useQuery({
    queryKey: planner.range(range),
    queryFn: () => listBlocks(range),
    enabled: Boolean(range.from && range.to),
  });
}

function invalidatePlannerBlocks(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: planner.blocks });
}

/**
 * Blocks never touch `["goals", "list"]`. Only the linked task's detail
 * and the task lists refresh — the Dashboard reads `scheduled_start/end`
 * from tasks, so a block write must not leave a stale task behind.
 */
function invalidateLinkedTask(queryClient: QueryClient, taskId: string | null | undefined): void {
  if (taskId) {
    void queryClient.invalidateQueries({ queryKey: tasks.detail(taskId) });
    void queryClient.invalidateQueries({ queryKey: tasks.lists });
  }
}

export function useCreateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBlockInput) => createBlock(input),
    onSuccess: (block: TimeBlock) => {
      invalidatePlannerBlocks(queryClient);
      invalidateLinkedTask(queryClient, block.taskId);
    },
  });
}

export interface UpdateBlockVariables {
  id: string;
  patch: UpdateBlockInput;
  /**
   * The task the block was linked to before the patch. A relink moves the
   * mirror on both tasks inside one service call, so the previous task's
   * cached detail would otherwise keep the old schedule until a reload.
   */
  previousTaskId?: string | null;
}

export function useUpdateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateBlockVariables) => updateBlock(variables.id, variables.patch),
    onSuccess: (block: TimeBlock, variables: UpdateBlockVariables) => {
      void queryClient.invalidateQueries({ queryKey: planner.detail(variables.id) });
      invalidatePlannerBlocks(queryClient);
      invalidateLinkedTask(queryClient, block.taskId);

      if (variables.previousTaskId && variables.previousTaskId !== block.taskId) {
        invalidateLinkedTask(queryClient, variables.previousTaskId);
      }
    },
  });
}

/**
 * The task is passed by the caller: the cached block detail may be absent
 * and `deleteBlock` returns void (Д8 clears the mirror inside the same
 * service call — one mutation, not two "successes"). Break/personal
 * blocks carry no `taskId` and leave the tasks cache alone.
 */
export interface DeleteBlockVariables {
  id: string;
  taskId?: string | null;
}

export function useDeleteBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteBlockVariables) => deleteBlock(variables.id),
    onSuccess: (_data: void, variables: DeleteBlockVariables) => {
      invalidatePlannerBlocks(queryClient);
      invalidateLinkedTask(queryClient, variables.taskId);
      void queryClient.removeQueries({ queryKey: planner.detail(variables.id) });
    },
  });
}

/**
 * Accept of a plan preview (plan.md Unit 9). The service inserts only the
 * missing pairs and mirrors them; the mutation refreshes the planner ranges
 * (day and week read through them) and every linked task list — the
 * Dashboard reads `scheduled_start/end` from tasks, so a stale list would
 * hide an accepted plan. `["goals", "list"]` is never touched from here.
 */
export function useApplyPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApplyPlanInput) => applyPlan(input),
    onSuccess: (result: ApplyPlanResult, input: ApplyPlanInput) => {
      invalidatePlannerBlocks(queryClient);

      const taskIds = new Set<string>([
        ...result.mirroredTaskIds,
        ...input.slots.map((slot) => slot.taskId),
      ]);

      for (const taskId of taskIds) {
        invalidateLinkedTask(queryClient, taskId);
      }
    },
  });
}
