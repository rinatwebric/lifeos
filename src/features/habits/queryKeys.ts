/** TanStack Query keys for habits. Only `habits.*` is ever invalidated by this feature. */
export const habits = {
  all: ["habits"] as const,
  list: () => [...habits.all, "list"] as const,
  detail: (id: string) => [...habits.all, "detail", id] as const,
  logs: (habitId: string) => [...habits.all, "logs", habitId] as const,
  logsRange: (from: string, to: string) => [...habits.all, "logs-range", from, to] as const,
  versions: (habitId: string) => [...habits.all, "versions", habitId] as const,
};
