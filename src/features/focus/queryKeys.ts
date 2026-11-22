export const focus = {
  all: ["focus"] as const,
  active: ["focus", "active"] as const,
  range: (from: string, to: string) => ["focus", "range", from, to] as const,
};
