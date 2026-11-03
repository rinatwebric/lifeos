import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { goals } from "@/features/goals/queryKeys";
import type { Task, TaskStatus } from "@/types/domain";

import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  rescheduleTask,
  setTaskStatus,
  updateTask,
  type TaskFilters,
} from "./api";
import { tasks } from "./queryKeys";
import type { CreateTaskInput, UpdateTaskInput } from "./schema";

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: tasks.list(filters),
    queryFn: () => listTasks(filters),
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: tasks.detail(id ?? ""),
    queryFn: () => getTask(id as string),
    enabled: Boolean(id),
  });
}

/** `[...goals.detail(goalId), "task-count"]` — the key `useTaskCountForGoal` reads. */
function taskCountKey(goalId: string) {
  return [...goals.detail(goalId), "task-count"] as const;
}

function invalidateTaskLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: tasks.lists });
}

function invalidateGoalTaskCount(
  queryClient: QueryClient,
  goalId: string | null | undefined,
): void {
  if (goalId) {
    void queryClient.invalidateQueries({ queryKey: taskCountKey(goalId) });
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: (task: Task) => {
      invalidateTaskLists(queryClient);
      invalidateGoalTaskCount(queryClient, task.goalId);
    },
  });
}

export interface UpdateTaskVariables {
  id: string;
  patch: UpdateTaskInput;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateTaskVariables) => updateTask(variables.id, variables.patch),
    onSuccess: (task: Task, variables: UpdateTaskVariables) => {
      void queryClient.invalidateQueries({ queryKey: tasks.detail(variables.id) });
      invalidateTaskLists(queryClient);
      invalidateGoalTaskCount(queryClient, task.goalId);
    },
  });
}

export interface SetTaskStatusVariables {
  id: string;
  status: TaskStatus;
}

interface SetTaskStatusContext {
  previousDetail: Task | undefined;
  previousLists: Array<readonly [readonly unknown[], Task[] | undefined]>;
}

/**
 * The only optimistic mutation in the tasks layer: the checkbox toggle must
 * feel instant. Everything else (create/update/reschedule/delete) waits for
 * the server so the UI never shows an unconfirmed value.
 */
export function useSetTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, SetTaskStatusVariables, SetTaskStatusContext>({
    mutationFn: (variables: SetTaskStatusVariables) =>
      setTaskStatus(variables.id, variables.status),
    onMutate: async (variables: SetTaskStatusVariables) => {
      await queryClient.cancelQueries({ queryKey: tasks.detail(variables.id) });
      await queryClient.cancelQueries({ queryKey: tasks.lists });

      const previousDetail = queryClient.getQueryData<Task>(tasks.detail(variables.id));
      const previousLists = queryClient.getQueriesData<Task[]>({ queryKey: tasks.lists });
      const nextCompletedAt =
        variables.status === "completed" ? new Date().toISOString() : null;

      if (previousDetail) {
        queryClient.setQueryData<Task>(tasks.detail(variables.id), {
          ...previousDetail,
          status: variables.status,
          completedAt: nextCompletedAt,
        });
      }
      queryClient.setQueriesData<Task[]>({ queryKey: tasks.lists }, (current) =>
        current?.map((task) =>
          task.id === variables.id
            ? { ...task, status: variables.status, completedAt: nextCompletedAt }
            : task,
        ),
      );

      return {
        previousDetail,
        previousLists,
      };
    },
    onError: (
      _error: Error,
      variables: SetTaskStatusVariables,
      context: SetTaskStatusContext | undefined,
    ) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(tasks.detail(variables.id), context.previousDetail);
      }
      for (const [key, data] of context?.previousLists ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: (_task: Task | undefined, _error: Error | null, variables: SetTaskStatusVariables) => {
      // A status flip never changes the goal link, so the goal's task-count
      // is untouched — only the detail and the lists refresh.
      void queryClient.invalidateQueries({ queryKey: tasks.detail(variables.id) });
      invalidateTaskLists(queryClient);
    },
  });
}

export interface RescheduleTaskVariables {
  id: string;
  dueDate: string | null;
}

export function useRescheduleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RescheduleTaskVariables) =>
      rescheduleTask(variables.id, variables.dueDate),
    onSuccess: (_task: Task, variables: RescheduleTaskVariables) => {
      // Moving the due date never changes the goal link, so the goal's
      // task-count is untouched — only the detail and the lists refresh.
      void queryClient.invalidateQueries({ queryKey: tasks.detail(variables.id) });
      invalidateTaskLists(queryClient);
    },
  });
}

/** The goal is passed by the caller: the cached detail may be absent. */
export interface DeleteTaskVariables {
  id: string;
  goalId?: string | null;
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteTaskVariables) => deleteTask(variables.id),
    onSuccess: (_data: void, variables: DeleteTaskVariables) => {
      invalidateTaskLists(queryClient);
      invalidateGoalTaskCount(queryClient, variables.goalId);
      void queryClient.removeQueries({ queryKey: tasks.detail(variables.id) });
    },
  });
}
