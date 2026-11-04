import { useEffect, useState } from "react";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { GoalFilters } from "@/features/goals/api";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
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

const SEARCH_INPUT_ID = "goals-filter-search";

function toOptional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function GoalsFilters({ filters, onChange }: GoalsFiltersProps) {
  const m = useMessages();
  const t = m.goals;
  const [search, setSearch] = useState(filters.search ?? "");
  const debouncedSearch = useDebouncedValue(search, 300);

  // Selects flow through `filters` immediately; the search push merges with
  // the latest selects — never a stale closure.
  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    const next = trimmed === "" ? undefined : trimmed;
    if ((filters.search ?? undefined) !== next) {
      onChange({ ...filters, search: next });
    }
    // `filters`/`onChange` intentionally excluded: pushing on every parent
    // render would loop through `setFilters`. The guard above compares
    // against the latest committed search, so a stale push is a no-op anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

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
    <div className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <label htmlFor="goals-filter-status" className="block text-ui font-medium text-content">
          {t.filtersStatus}
        </label>
        <Select
          id="goals-filter-status"
          value={filters.status ?? ""}
          onChange={(event) =>
            onChange({ ...filters, status: toOptional(event.target.value) as GoalStatus | undefined })
          }
        >
          <option value="">{t.allStatuses}</option>
          {GOAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {m.enums.status[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goals-filter-category" className="block text-ui font-medium text-content">
          {t.filtersCategory}
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
          <option value="">{t.allCategories}</option>
          {GOAL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {m.enums.category[category]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goals-filter-priority" className="block text-ui font-medium text-content">
          {t.filtersPriority}
        </label>
        <Select
          id="goals-filter-priority"
          value={filters.priority ?? ""}
          onChange={(event) =>
            onChange({ ...filters, priority: toOptional(event.target.value) as Priority | undefined })
          }
        >
          <option value="">{t.allPriorities}</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {m.enums.priority[priority]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={SEARCH_INPUT_ID} className="block text-ui font-medium text-content">
          {t.filtersSearch}
        </label>
        <Input
          id={SEARCH_INPUT_ID}
          type="search"
          placeholder={t.searchGoals}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
    </div>
  );
}
