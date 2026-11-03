import type { Milestone, ProgressMode } from "@/types/domain";

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Completed milestones / total milestones × 100.
 * Returns `null` when there are no milestones so the UI can show an empty
 * state instead of a discouraging 0%.
 */
export function calculateMilestoneProgress(
  completedMilestones: number,
  totalMilestones: number,
): number | null {
  if (totalMilestones <= 0) {
    return null;
  }

  return clampPercent((completedMilestones / totalMilestones) * 100);
}

interface GoalProgressSource {
  progressMode: ProgressMode;
  progress: number;
  milestones: Pick<Milestone, "status">[];
}

/**
 * Milestone-based progress wins when the goal uses that mode and has milestones.
 * Otherwise the manual value is used, clamped to the 0–100 range.
 * Always returns a number: with zero milestones it falls back to the clamped
 * manual value, so callers never need `?? goal.progress`.
 */
export function calculateGoalProgress(goal: GoalProgressSource): number {
  if (goal.progressMode === "milestones") {
    const completed = goal.milestones.filter(
      (milestone) => milestone.status === "completed",
    ).length;
    const derived = calculateMilestoneProgress(completed, goal.milestones.length);

    if (derived !== null) {
      return derived;
    }
  }

  return clampPercent(goal.progress);
}

/** Completed / total × 100, or `null` when nothing was planned. */
export function calculateCompletionRate(completed: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return clampPercent((completed / total) * 100);
}
