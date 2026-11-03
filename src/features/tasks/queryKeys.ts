import type { TaskFilters } from "./api";

/**
 * TanStack Query key factory for tasks. Every tasks hook builds its key
 * here so invalidation stays scoped to tasks keys only — never a bare
 * `invalidateQueries()` over the whole cache. `lists` is the shared prefix
 * so one invalidation refreshes every filter variant.
 */
export const tasks = {
  all: ["tasks"] as const,
  lists: ["tasks", "list"] as const,
  list: (filters?: TaskFilters) => ["tasks", "list", filters ?? {}] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
};

/** Alias for readers that prefer an explicit `*QueryKeys` name. */
export const taskQueryKeys = tasks;
