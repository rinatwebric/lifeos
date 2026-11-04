import type {
  BlockType,
  Goal,
  GoalCategory,
  GoalStatus,
  Milestone,
  MilestoneStatus,
  Priority,
  Profile,
  ProgressMode,
  RecurrenceRule,
  Task,
  TaskStatus,
  TimeBlock,
  UserPreferences,
} from "./domain";

/**
 * Snake_case mirror of the Supabase schema (migrations 0001_profiles,
 * 0002_user_preferences). Application code uses camelCase `domain.ts` types;
 * mapping happens at the service boundary via the functions below.
 * Later this file will be replaced by `supabase gen types`.
 */

export interface ProfilesRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: "en" | "ru" | "ky";
  theme: "light" | "dark";
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow {
  id: string;
  user_id: string;
  wake_up_time: string;
  sleep_time: string;
  working_hours: Record<string, unknown>;
  study_hours: Record<string, unknown>;
  preferred_work_periods: Record<string, unknown>;
  notification_preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function mapProfileRowToProfile(row: ProfilesRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    language: row.language,
    theme: row.theme,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUserPreferencesRowToUserPreferences(
  row: UserPreferencesRow,
): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    wakeUpTime: row.wake_up_time,
    sleepTime: row.sleep_time,
    workingHours: row.working_hours,
    studyHours: row.study_hours,
    preferredWorkPeriods: row.preferred_work_periods,
    notificationPreferences: row.notification_preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mirrors migration 0003_goals_milestones (goals). */
export interface GoalsRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: GoalCategory;
  priority: Priority;
  status: GoalStatus;
  start_date: string;
  target_date: string | null;
  progress: number;
  progress_mode: ProgressMode;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Mirrors migration 0003_goals_milestones (milestones). */
export interface MilestonesRow {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  description: string | null;
  position: number;
  status: MilestoneStatus;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapGoalRowToGoal(row: GoalsRow): Goal {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    startDate: row.start_date,
    targetDate: row.target_date,
    progress: row.progress,
    progressMode: row.progress_mode,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMilestoneRowToMilestone(row: MilestonesRow): Milestone {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    position: row.position,
    status: row.status,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mirrors migration 0004_tasks_recurrence (recurrence_rules). */
export interface RecurrenceRulesRow {
  id: string;
  user_id: string;
  frequency: RecurrenceRule["frequency"];
  weekdays: number[];
  interval_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Mirrors migration 0004_tasks_recurrence (tasks). */
export interface TasksRow {
  id: string;
  user_id: string;
  goal_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_duration_minutes: number | null;
  completed_at: string | null;
  recurrence_rule_id: string | null;
  created_at: string;
  updated_at: string;
}

export function mapRecurrenceRuleRowToRecurrenceRule(row: RecurrenceRulesRow): RecurrenceRule {
  return {
    id: row.id,
    userId: row.user_id,
    frequency: row.frequency,
    weekdays: row.weekdays,
    intervalValue: row.interval_value,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTaskRowToTask(row: TasksRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    completedAt: row.completed_at,
    recurrenceRuleId: row.recurrence_rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mirrors migration 0005_time_blocks. */
export interface TimeBlocksRow {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  block_type: BlockType;
  created_at: string;
  updated_at: string;
}

export function mapTimeBlockRowToTimeBlock(row: TimeBlocksRow): TimeBlock {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    blockType: row.block_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
