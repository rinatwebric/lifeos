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

export const BLOCK_TYPES = ["task", "break", "personal"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Weekday keys used by availability JSONB columns (`mon` … `sun`). */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Wall-clock interval within one day, "HH:MM" (24-hour). */
export interface AvailabilityWindow {
  start: string;
  end: string;
}

/**
 * Shape of `working_hours`, `study_hours` and `preferred_work_periods`
 * (migration 0002_user_preferences): weekday → that day's windows.
 * A missing key — or an empty array — means "not set"; never both, the write
 * path drops empty days.
 */
export type AvailabilityWindows = Partial<Record<Weekday, AvailabilityWindow[]>>;

export const HABIT_STATUSES = ["active", "paused", "archived"] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

export const AI_PROPOSAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export type AiProposalStatus = (typeof AI_PROPOSAL_STATUSES)[number];

/**
 * All proposal kinds the assistant may return (plan-phase-4 Р2, CHECK in
 * migration 0006). Rollout order is enforced in code, not by narrowing this
 * union: goal_breakdown + task_creation → schedule_suggestion →
 * schedule_changes → productivity_analysis.
 */
export const PROPOSAL_TYPES = [
  "goal_breakdown",
  "task_creation",
  "schedule_suggestion",
  "schedule_changes",
  "productivity_analysis",
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const AI_MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

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
  blockType: BlockType;
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

/**
 * One snapshot of a habit's schedule (Phase 5 step 1b, migration 0008).
 * The version effective on a date decides whether that date was scheduled
 * (frequency/weekdays/target_count/start_date) and whether pauses exclude
 * it (status). `effectiveTo: null` marks the currently open version.
 */
export interface HabitScheduleVersion extends BaseEntity {
  habitId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  targetCount: number;
  startDate: string;
  status: HabitStatus;
}

export interface AiConversation extends BaseEntity {
  title: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: AiMessageRole;
  content: string;
  /** JSONB object. Provider-specific extras; never secrets (PRD §6.7). */
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AiProposal extends BaseEntity {
  conversationId: string | null;
  proposalType: ProposalType;
  payload: unknown;
  status: AiProposalStatus;
  expiresAt: string | null;
  appliedAt: string | null;
}

export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ["completed", "cancelled"];

export function isTaskClosed(status: TaskStatus): boolean {
  return CLOSED_TASK_STATUSES.includes(status);
}

export const PROFILE_LANGUAGES = ["en", "ru", "ky"] as const;
export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number];

export const PROFILE_THEMES = ["light", "dark"] as const;
export type ProfileTheme = (typeof PROFILE_THEMES)[number];

/**
 * Application view of `public.profiles` (camelCase). The row id IS the auth
 * user id, so unlike other entities there is no separate `userId` field.
 * Mirrors migration 0001_profiles.
 */
export interface Profile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  timezone: string;
  language: ProfileLanguage;
  theme: ProfileTheme;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Application view of `public.user_preferences` (camelCase).
 * Mirrors migration 0002_user_preferences. The row is created by the
 * `handle_new_user` trigger; the client only ever updates it.
 */
export interface UserPreferences extends BaseEntity {
  wakeUpTime: string;
  sleepTime: string;
  workingHours: AvailabilityWindows;
  studyHours: AvailabilityWindows;
  preferredWorkPeriods: AvailabilityWindows;
  notificationPreferences: Record<string, unknown>;
}
