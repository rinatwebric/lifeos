import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { calculateHabitStats } from "@/lib/habits";
import { toDateKey } from "@/lib/dates";
import type { HabitStatus } from "@/types/domain";

import {
  createHabit,
  deleteHabit,
  deleteHabitLog,
  getHabit,
  listAllHabitVersions,
  listHabitLogs,
  listHabitLogsRange,
  listHabits,
  listHabitVersions,
  logHabit,
  setHabitStatus,
  updateHabit,
  updateHabitLog,
} from "./api";
import { habits } from "./queryKeys";
import type {
  CreateHabitInput,
  CreateHabitLogInput,
  UpdateHabitInput,
  UpdateHabitLogInput,
} from "./schemas";

function invalidateHabits(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: habits.all });
}

export function useHabits() {
  return useQuery({ queryKey: habits.list(), queryFn: listHabits });
}

export function useHabit(id: string | undefined) {
  return useQuery({
    queryKey: habits.detail(id ?? ""),
    queryFn: () => getHabit(id as string),
    enabled: Boolean(id),
  });
}

export function useHabitLogs(habitId: string | undefined, range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: habits.logs(habitId ?? ""),
    queryFn: () => listHabitLogs(habitId as string, range),
    enabled: Boolean(habitId),
  });
}

export function useHabitLogsRange(range: { from: string; to: string } | undefined) {
  return useQuery({
    queryKey: habits.logsRange(range?.from ?? "", range?.to ?? ""),
    queryFn: () => listHabitLogsRange(range as { from: string; to: string }),
    enabled: Boolean(range),
  });
}

export function useHabitVersions(habitId: string | undefined) {
  return useQuery({
    queryKey: habits.versions(habitId ?? ""),
    queryFn: () => listHabitVersions(habitId as string),
    enabled: Boolean(habitId),
  });
}

/**
 * One habit with its logs, snapshots and version-aware stats. Three
 * parallel queries (habit, logs, versions) composed client-side — the
 * range reads are single paginated queries, never one request per day.
 */
export function useHabitWithStats(
  habitId: string | undefined,
  range: { from: string; to: string },
  todayKey: string,
) {
  const [habitQuery, logsQuery, versionsQuery] = useQueries({
    queries: [
      {
        queryKey: habits.detail(habitId ?? ""),
        queryFn: () => getHabit(habitId as string),
        enabled: Boolean(habitId),
      },
      {
        queryKey: habits.logs(habitId ?? ""),
        queryFn: () => listHabitLogs(habitId as string, range),
        enabled: Boolean(habitId),
      },
      {
        queryKey: habits.versions(habitId ?? ""),
        queryFn: () => listHabitVersions(habitId as string),
        enabled: Boolean(habitId),
      },
    ],
  });

  const stats = useMemo(() => {
    if (!habitQuery.data) {
      return null;
    }

    return calculateHabitStats({
      habit: habitQuery.data,
      versions: versionsQuery.data ?? [],
      logs: logsQuery.data ?? [],
      todayKey,
    });
  }, [habitQuery.data, logsQuery.data, versionsQuery.data, todayKey]);

  return { habitQuery, logsQuery, versionsQuery, stats };
}

/**
 * All habits with stats for a period. Three parallel queries total
 * (habits, all logs in range, all snapshots) grouped client-side by
 * habit id — no N+1. `todayKey` defaults to the current day in UTC;
 * callers with a profile timezone pass `toDateKey(new Date(), timeZone)`.
 */
export function useHabitsWithStats(range: { from: string; to: string }, todayKey?: string) {
  const habitsQuery = useHabits();
  const logsQuery = useHabitLogsRange(range);
  const versionsQuery = useQuery({
    queryKey: [...habits.all, "versions-all"] as const,
    queryFn: listAllHabitVersions,
  });

  const resolvedToday = todayKey ?? toDateKey(new Date(), "UTC");

  const rows = useMemo(() => {
    if (!habitsQuery.data) {
      return [];
    }

    const logsByHabit = new Map<string, typeof logsQuery.data>();
    for (const entry of logsQuery.data ?? []) {
      const list = logsByHabit.get(entry.habitId) ?? [];
      list.push(entry);
      logsByHabit.set(entry.habitId, list);
    }

    const versionsByHabit = new Map<string, typeof versionsQuery.data>();
    for (const entry of versionsQuery.data ?? []) {
      const list = versionsByHabit.get(entry.habitId) ?? [];
      list.push(entry);
      versionsByHabit.set(entry.habitId, list);
    }

    return habitsQuery.data.map((habit) => ({
      habit,
      stats: calculateHabitStats({
        habit,
        versions: versionsByHabit.get(habit.id) ?? [],
        logs: logsByHabit.get(habit.id) ?? [],
        todayKey: resolvedToday,
      }),
    }));
  }, [habitsQuery.data, logsQuery.data, versionsQuery.data, resolvedToday]);

  return { habitsQuery, logsQuery, versionsQuery, rows, todayKey: resolvedToday };
}

export function useCreateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHabitInput) => createHabit(input),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export interface UpdateHabitVariables {
  id: string;
  patch: UpdateHabitInput;
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: UpdateHabitVariables) => updateHabit(variables.id, variables.patch),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useSetHabitStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { id: string; status: HabitStatus }) =>
      setHabitStatus(variables.id, variables.status),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteHabit(id),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useLogHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHabitLogInput) => logHabit(input),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useUpdateHabitLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { id: string; patch: UpdateHabitLogInput }) =>
      updateHabitLog(variables.id, variables.patch),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useDeleteHabitLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteHabitLog(id),
    onSuccess: () => invalidateHabits(queryClient),
  });
}
