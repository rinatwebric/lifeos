export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const GOAL_CATEGORIES = [
  "career",
  "education",
  "health",
  "finance",
  "personal_development",
  "relationships",
  "projects",
  "other",
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_STATUSES = ["not_started", "active", "paused", "completed", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const PROGRESS_MODES = ["manual", "milestones"] as const;
export type ProgressMode = (typeof PROGRESS_MODES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * The PRD does not enumerate milestone statuses. Only the two states the product
 * actually relies on are modelled until an explicit list is agreed.
 */
export const MILESTONE_STATUSES = ["pending", "completed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekdays", "weekly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const HABIT_STATUSES = ["active", "paused", "archived"] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

export const AI_PROPOSAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export type AiProposalStatus = (typeof AI_PROPOSAL_STATUSES)[number];

export type AiMessageRole = "user" | "assistant" | "system";

export interface BaseEntity {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal extends BaseEntity {
  title: string;
  description: string | null;
  category: GoalCategory;
  priority: Priority;
  status: GoalStatus;
  startDate: string;
  targetDate: string | null;
  progress: number;
  progressMode: ProgressMode;
  completedAt: string | null;
}

export interface Milestone extends BaseEntity {
  goalId: string;
  title: string;
  description: string | null;
  position: number;
  status: MilestoneStatus;
  targetDate: string | null;
  completedAt: string | null;
}

export interface Task extends BaseEntity {
  goalId: string | null;
  milestoneId: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedDurationMinutes: number | null;
  completedAt: string | null;
  recurrenceRuleId: string | null;
}

export interface RecurrenceRule extends BaseEntity {
  frequency: RecurrenceFrequency;
  weekdays: number[];
  intervalValue: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface TimeBlock extends BaseEntity {
  taskId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  blockType: string;
}

export interface Habit extends BaseEntity {
  title: string;
  description: string | null;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  targetCount: number;
  reminderTime: string | null;
  startDate: string;
  status: HabitStatus;
}

export interface HabitLog extends BaseEntity {
  habitId: string;
  logDate: string;
  completedCount: number;
  note: string | null;
}

export interface AiProposal extends BaseEntity {
  conversationId: string | null;
  proposalType: string;
  payload: unknown;
  status: AiProposalStatus;
  expiresAt: string | null;
  appliedAt: string | null;
}

export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ["completed", "cancelled"];

export function isTaskClosed(status: TaskStatus): boolean {
  return CLOSED_TASK_STATUSES.includes(status);
}