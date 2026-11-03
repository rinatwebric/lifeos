import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { GoalFilters } from "@/features/goals/api";
import { humanize } from "@/lib/strings";
import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  PRIORITIES,
  type GoalCategory,
  type GoalStatus,
  type Priority,
} from "@/types/domain";

interface GoalsFiltersProps {
  filters: GoalFilters;
  onChange: (filters: GoalFilters) => void;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_INPUT_ID = "goals-filter-search";

function toOptional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function GoalsFilters({ filters, onChange }: GoalsFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? "");
  // Select changes flow through `filters` immediately, so the debounced
  // search push must merge with the latest selects — never a stale closure.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = search.trim();
      const next = trimmed === "" ? undefined : trimmed;
      if ((filtersRef.current.search ?? undefined) !== next) {
        onChange({ ...filtersRef.current, search: next });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search, onChange]);

  // Follow external resets (e.g. "Clear filters") without clobbering typing:
  // a render-phase adjustment, not an effect, so no cascading render.
  // Skipped while the box is focused so keystrokes never get overwritten.
  const [syncedSearch, setSyncedSearch] = useState(filters.search ?? "");
  if ((filters.search ?? "") !== syncedSearch) {
    setSyncedSearch(filters.search ?? "");
    if (typeof document === "undefined" || document.activeElement?.id !== SEARCH_INPUT_ID) {
      setSearch(filters.search ?? "");
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <label htmlFor="goals-filter-status" className="block text-sm font-medium text-content">
          Status
        </label>
        <Select
          id="goals-filter-status"
          value={filters.status ?? ""}
          onChange={(event) =>
            onChange({ ...filters, status: toOptional(event.target.value) as GoalStatus | undefined })
          }
        >
          <option value="">All statuses</option>
          {GOAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {humanize(status)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goals-filter-category" className="block text-sm font-medium text-content">
          Category
        </label>
        <Select
          id="goals-filter-category"
          value={filters.category ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              category: toOptional(event.target.value) as GoalCategory | undefined,
            })
          }
        >
          <option value="">All categories</option>
          {GOAL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {humanize(category)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goals-filter-priority" className="block text-sm font-medium text-content">
          Priority
        </label>
        <Select
          id="goals-filter-priority"
          value={filters.priority ?? ""}
          onChange={(event) =>
            onChange({ ...filters, priority: toOptional(event.target.value) as Priority | undefined })
          }
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {humanize(priority)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={SEARCH_INPUT_ID} className="block text-sm font-medium text-content">
          Search
        </label>
        <Input
          id={SEARCH_INPUT_ID}
          type="search"
          placeholder="Search goals…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
    </div>
  );
}
