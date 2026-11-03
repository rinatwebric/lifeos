import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Goal, Milestone } from "@/types/domain";
import { tasks } from "@/features/tasks/queryKeys";

import {
  countTasksForGoal,
  createGoal,
  createMilestone,
  deleteGoal,
  deleteMilestone,
  getGoal,
  listAllMilestones,
  listGoals,
  listMilestones,
  reorderMilestones,
  updateGoal,
  updateMilestone,
  type GoalFilters,
} from "./api";
import { goals } from "./queryKeys";
import type {
  CreateGoalInput,
  CreateMilestoneInput,
  UpdateGoalInput,
  UpdateMilestoneInput,
} from "./schema";

const GOAL_LIST_PREFIX = ["goals", "list"] as const;

export function useGoals(filters?: GoalFilters) {
  return useQuery({
    queryKey: goals.list(filters),
    queryFn: () => listGoals(filters),
  });
}

export function useGoal(id: string | undefined) {
  return useQuery({
    queryKey: goals.detail(id ?? ""),
    queryFn: () => getGoal(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goals.all });
    },
  });
}

export interface UpdateGoalVariables {
  id: string;
  patch: UpdateGoalInput;
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateGoalVariables) => updateGoal(variables.id, variables.patch),
    onSuccess: (_data: Goal, variables: UpdateGoalVariables) => {
      void queryClient.invalidateQueries({ queryKey: goals.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: (_data: void, id: string) => {
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
      void queryClient.removeQueries({ queryKey: goals.detail(id) });
      void queryClient.removeQueries({ queryKey: goals.milestones(id) });
      // Deleting a goal unlinks its tasks (SET NULL), so every tasks list
      // variant is stale — refresh them alongside the goals keys.
      void queryClient.invalidateQueries({ queryKey: tasks.lists });
      void queryClient.invalidateQueries({ queryKey: goals.all });
    },
  });
}

export function useMilestones(goalId: string | undefined) {
  return useQuery({
    queryKey: goals.milestones(goalId ?? ""),
    queryFn: () => listMilestones(goalId as string),
    enabled: Boolean(goalId),
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => createMilestone(input),
    onSuccess: (_data: Milestone, variables: CreateMilestoneInput) => {
      void queryClient.invalidateQueries({ queryKey: goals.milestones(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: goals.detail(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
      void queryClient.invalidateQueries({ queryKey: goals.allMilestones });
    },
  });
}

export interface UpdateMilestoneVariables {
  id: string;
  goalId: string;
  patch: UpdateMilestoneInput;
}

interface MilestoneOptimisticContext {
  previous: Milestone[] | undefined;
}

function isStatusOnlyPatch(patch: UpdateMilestoneInput): boolean {
  return Object.keys(patch).every((key) => key === "status");
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation<Milestone, Error, UpdateMilestoneVariables, MilestoneOptimisticContext>({
    mutationFn: (variables: UpdateMilestoneVariables) =>
      updateMilestone(variables.id, variables.patch),
    onMutate: async (variables: UpdateMilestoneVariables) => {
      // Optimistic update is reserved for milestone status toggles only.
      // Title/description/position edits wait for the server so the UI never
      // shows an unconfirmed value.
      if (!isStatusOnlyPatch(variables.patch) || variables.patch.status === undefined) {
        return { previous: undefined };
      }

      const nextStatus = variables.patch.status;
      await queryClient.cancelQueries({ queryKey: goals.milestones(variables.goalId) });
      const previous = queryClient.getQueryData<Milestone[]>(
        goals.milestones(variables.goalId),
      );

      if (previous) {
        queryClient.setQueryData<Milestone[]>(goals.milestones(variables.goalId), (current) =>
          (current ?? []).map((milestone) =>
            milestone.id === variables.id
              ? {
                  ...milestone,
                  status: nextStatus,
                  completedAt: nextStatus === "completed" ? new Date().toISOString() : null,
                }
              : milestone,
          ),
        );
      }

      return { previous };
    },
    onError: (
      _error: Error,
      variables: UpdateMilestoneVariables,
      context: MilestoneOptimisticContext | undefined,
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(goals.milestones(variables.goalId), context.previous);
      }
    },
    onSettled: (_data: Milestone | undefined, _error: Error | null, variables) => {
      void queryClient.invalidateQueries({ queryKey: goals.milestones(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: goals.detail(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
      void queryClient.invalidateQueries({ queryKey: goals.allMilestones });
    },
  });
}

export interface DeleteMilestoneVariables {
  id: string;
  goalId: string;
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteMilestoneVariables) => deleteMilestone(variables.id),
    onSuccess: (_data: void, variables: DeleteMilestoneVariables) => {
      void queryClient.invalidateQueries({ queryKey: goals.milestones(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: goals.detail(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
      void queryClient.invalidateQueries({ queryKey: goals.allMilestones });
    },
  });
}

export interface ReorderMilestonesVariables {
  goalId: string;
  orderedIds: string[];
}

export function useReorderMilestones() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ReorderMilestonesVariables) =>
      reorderMilestones(variables.goalId, variables.orderedIds),
    onSuccess: (_data: Milestone[], variables: ReorderMilestonesVariables) => {
      void queryClient.invalidateQueries({ queryKey: goals.milestones(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: goals.detail(variables.goalId) });
      void queryClient.invalidateQueries({ queryKey: GOAL_LIST_PREFIX });
      void queryClient.invalidateQueries({ queryKey: goals.allMilestones });
    },
  });
}

export function useTaskCountForGoal(goalId: string | undefined) {
  return useQuery({
    queryKey: [...goals.detail(goalId ?? ""), "task-count"] as const,
    queryFn: () => countTasksForGoal(goalId as string),
    enabled: Boolean(goalId),
  });
}

/**
 * All of the user's milestones as `{ goalId, status }` slices in one query.
 * The list groups them by goal for `calculateGoalProgress` — never one
 * `useMilestones` per card (N+1).
 */
export function useAllMilestones() {
  return useQuery({
    queryKey: goals.allMilestones,
    queryFn: listAllMilestones,
  });
}
