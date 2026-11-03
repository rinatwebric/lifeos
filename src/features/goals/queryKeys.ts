import type { GoalFilters } from "./api";

/**
 * TanStack Query key factory for goals. Every goals hook builds its key
 * here so invalidation stays scoped to goals keys only — never a bare
 * `invalidateQueries()` over the whole cache.
 */
export const goals = {
  all: ["goals"] as const,
  list: (filters?: GoalFilters) => ["goals", "list", filters ?? {}] as const,
  detail: (id: string) => ["goals", "detail", id] as const,
  milestones: (goalId: string) => ["goals", "milestones", goalId] as const,
};

/** Alias for readers that prefer an explicit `*QueryKeys` name. */
export const goalQueryKeys = goals;
