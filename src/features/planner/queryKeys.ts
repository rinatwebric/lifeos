import type { BlockRange } from "./api";

/**
 * TanStack Query key factory for the planner. Every planner hook builds
 * its key here so invalidation stays scoped — never a bare
 * `invalidateQueries()` over the whole cache. `blocks` is the shared
 * prefix so one invalidation refreshes every range and detail variant.
 * Task invalidation lives in `hooks.ts` next to the mutations (tasks
 * detail + lists); `["goals", "list"]` is never touched from this module.
 */
export const planner = {
  all: ["planner"] as const,
  blocks: ["planner", "blocks"] as const,
  range: (range: BlockRange) => ["planner", "blocks", "range", range] as const,
  detail: (id: string) => ["planner", "blocks", "detail", id] as const,
};

/** Alias for readers that prefer an explicit `*QueryKeys` name. */
export const plannerQueryKeys = planner;
