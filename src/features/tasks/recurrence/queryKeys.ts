/**
 * TanStack Query key factory for recurrence rules. Scoped under
 * `["recurrence-rules"]` so invalidation never touches the tasks cache
 * except through the explicit task-list invalidation in the hooks.
 */
export const recurrenceRules = {
  all: ["recurrence-rules"] as const,
  lists: ["recurrence-rules", "list"] as const,
  detail: (id: string) => ["recurrence-rules", "detail", id] as const,
};

export type RecurrenceRulesQueryKeys = typeof recurrenceRules;
