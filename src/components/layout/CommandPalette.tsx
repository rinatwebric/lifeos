import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ListChecks,
  Plus,
  Repeat2,
  Search,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Dialog } from "@/components/ui/Dialog";
import { usePrimaryNav, useSecondaryNav } from "@/app/navigation";
import { listGoals } from "@/features/goals/api";
import { listHabits } from "@/features/habits/api";
import { listTasks } from "@/features/tasks/api";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

interface CommandPaletteProps {
  onClose: () => void;
}

type PaletteGroup = "pages" | "actions" | "tasks" | "goals" | "habits";

interface PaletteItem {
  key: string;
  label: string;
  group: PaletteGroup;
  icon: LucideIcon;
  run: () => void;
}

/**
 * A keyboard-first surface for the two things the sidebar is slow at: jumping
 * to a page and finding a record by name. Data comes from the same list APIs
 * as the pages, so the palette never invents a second query contract.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const m = useMessages();
  const cp = m.commandPalette;
  const navigate = useNavigate();
  const primary = usePrimaryNav();
  const secondary = useSecondaryNav();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const term = debounced.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searchEnabled = term.length >= 2;
  const tasksQuery = useQuery({
    queryKey: ["tasks", "command", term],
    queryFn: () => listTasks({ search: term }),
    enabled: searchEnabled,
    staleTime: 30_000,
  });
  const goalsQuery = useQuery({
    queryKey: ["goals", "command", term],
    queryFn: () => listGoals({ search: term }),
    enabled: searchEnabled,
    staleTime: 30_000,
  });
  const habitsQuery = useQuery({
    queryKey: ["habits", "command"],
    queryFn: listHabits,
    enabled: searchEnabled,
    staleTime: 30_000,
  });

  const closeAndRun = (run: () => void): void => {
    onClose();
    run();
  };

  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = (label: string): boolean =>
      needle.length === 0 || label.toLocaleLowerCase().includes(needle);

    const pages: PaletteItem[] = [...primary, ...secondary]
      .filter((entry) => matches(entry.label))
      .map((entry) => ({
        key: `page-${entry.to}`,
        label: entry.label,
        group: "pages",
        icon: entry.icon,
        run: () => navigate(entry.to),
      }));

    const actions: PaletteItem[] = [
      { key: "new-task", label: cp.newTask, icon: ListChecks, to: "/tasks?new=1" },
      { key: "new-goal", label: cp.newGoal, icon: Target, to: "/goals?new=1" },
      { key: "new-habit", label: cp.newHabit, icon: Repeat2, to: "/habits?new=1" },
      { key: "new-block", label: cp.newBlock, icon: CalendarDays, to: "/planner?new=1" },
    ]
      .filter((action) => matches(action.label))
      .map((action) => ({
        key: action.key,
        label: action.label,
        group: "actions" as const,
        icon: action.key === "new-task" ? Plus : action.icon,
        run: () => navigate(action.to),
      }));

    const taskItems: PaletteItem[] = searchEnabled
      ? (tasksQuery.data ?? []).slice(0, 6).map((task) => ({
          key: `task-${task.id}`,
          label: task.title,
          group: "tasks" as const,
          icon: ListChecks,
          run: () => navigate(`/tasks?search=${encodeURIComponent(task.title)}`),
        }))
      : [];

    const goalItems: PaletteItem[] = searchEnabled
      ? (goalsQuery.data ?? []).slice(0, 6).map((goal) => ({
          key: `goal-${goal.id}`,
          label: goal.title,
          group: "goals" as const,
          icon: Target,
          run: () => navigate(`/goals/${goal.id}`),
        }))
      : [];

    const habitItems: PaletteItem[] = searchEnabled
      ? (habitsQuery.data ?? [])
          .filter((habit) => habit.title.toLocaleLowerCase().includes(needle))
          .slice(0, 6)
          .map((habit) => ({
            key: `habit-${habit.id}`,
            label: habit.title,
            group: "habits" as const,
            icon: Repeat2,
            run: () => navigate("/habits"),
          }))
      : [];

    return [...pages, ...actions, ...taskItems, ...goalItems, ...habitItems];
  }, [
    cp.newBlock,
    cp.newGoal,
    cp.newHabit,
    cp.newTask,
    goalsQuery.data,
    habitsQuery.data,
    navigate,
    primary,
    query,
    searchEnabled,
    secondary,
    tasksQuery.data,
  ]);

  const safeActive = items.length === 0 ? 0 : Math.min(active, items.length - 1);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (list && current) {
      list.scrollTop = Math.max(
        0,
        current.offsetTop - list.clientHeight / 2 + current.clientHeight / 2,
      );
    }
  }, [safeActive]);

  const loading =
    searchEnabled && (tasksQuery.isPending || goalsQuery.isPending || habitsQuery.isPending);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setActive((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length,
      );
      return;
    }
    if (event.key === "Enter" && items[safeActive]) {
      event.preventDefault();
      closeAndRun(items[safeActive].run);
    }
  };

  let lastGroup: PaletteGroup | null = null;

  return (
    <Dialog open onClose={onClose} title={cp.title} description={cp.hint}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          data-autofocus
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={cp.placeholder}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items[safeActive] ? `${listId}-${safeActive}` : undefined}
          className="h-11 w-full rounded-control border border-control bg-surface pr-3 pl-9 text-base text-content placeholder:text-muted focus:border-content sm:text-ui"
        />
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={cp.title}
        className="scrollbar-neutral max-h-[min(56dvh,26rem)] space-y-1 overflow-y-auto overscroll-contain"
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <div key={item.key}>
              {showGroup ? (
                <p className="px-2.5 pt-2 pb-1 text-micro text-muted">{cp[item.group]}</p>
              ) : null}
              <button
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === safeActive}
                data-active={index === safeActive || undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => closeAndRun(item.run)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-ui transition-colors",
                  index === active
                    ? "bg-surface-muted text-content"
                    : "text-content hover:bg-surface-muted",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            </div>
          );
        })}

        {loading ? (
          <p role="status" className="px-2.5 py-3 text-ui text-muted">
            {m.common.loading}
          </p>
        ) : null}

        {!loading && items.length === 0 ? (
          <p className="px-2.5 py-3 text-ui text-muted">{cp.empty}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
