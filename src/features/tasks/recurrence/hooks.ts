import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { tasks } from "@/features/tasks/queryKeys";

import {
  createRecurrenceRule,
  createRecurringTask,
  deactivateRecurrenceRule,
  deleteRecurrenceRule,
  listRecurrenceRules,
  topUpRecurrenceInstances,
  updateRecurrenceRule,
  type CreateRecurringTaskInput,
  type CreateRecurringTaskResult,
} from "./api";
import { recurrenceRules } from "./queryKeys";
import type { CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "./schema";
import type { RecurrenceRule } from "@/types/domain";

function invalidateRecurrence(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: recurrenceRules.all });
  void queryClient.invalidateQueries({ queryKey: tasks.lists });
}

export function useRecurrenceRules() {
  return useQuery({
    queryKey: recurrenceRules.lists,
    queryFn: () => listRecurrenceRules(),
  });
}

export function useCreateRecurrenceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRecurrenceRuleInput) => createRecurrenceRule(input),
    onSuccess: () => {
      invalidateRecurrence(queryClient);
    },
  });
}

export function useCreateRecurringTask() {
  const queryClient = useQueryClient();

  return useMutation<CreateRecurringTaskResult, Error, CreateRecurringTaskInput & { timeZone?: string }>({
    mutationFn: (variables) => {
      const { timeZone, ...input } = variables;
      return createRecurringTask(input, timeZone ? { timeZone } : undefined);
    },
    onSuccess: () => {
      invalidateRecurrence(queryClient);
    },
  });
}

export interface UpdateRecurrenceRuleVariables {
  id: string;
  patch: UpdateRecurrenceRuleInput;
}

export function useUpdateRecurrenceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateRecurrenceRuleVariables) =>
      updateRecurrenceRule(variables.id, variables.patch),
    onSuccess: (rule: RecurrenceRule, variables: UpdateRecurrenceRuleVariables) => {
      void queryClient.invalidateQueries({ queryKey: recurrenceRules.detail(variables.id) });
      invalidateRecurrence(queryClient);
      void rule;
    },
  });
}

export function useDeactivateRecurrenceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateRecurrenceRule(id),
    onSuccess: (_rule: RecurrenceRule, id: string) => {
      void queryClient.invalidateQueries({ queryKey: recurrenceRules.detail(id) });
      invalidateRecurrence(queryClient);
    },
  });
}

export function useDeleteRecurrenceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRecurrenceRule(id),
    onSuccess: (_data: void, id: string) => {
      void queryClient.removeQueries({ queryKey: recurrenceRules.detail(id) });
      invalidateRecurrence(queryClient);
    },
  });
}

export function useTopUpRecurrenceInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ruleId,
      horizonDays,
      timeZone,
    }: {
      ruleId: string;
      horizonDays?: number;
      timeZone?: string;
    }) => topUpRecurrenceInstances(ruleId, { horizonDays, timeZone }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasks.lists });
    },
  });
}
