import type { ProposalAction } from "@/lib/aiProposals";
import { tmpl } from "@/lib/i18n/format";
import type { Messages } from "@/lib/i18n/I18nContext";

/**
 * Human-readable one-liners for proposal actions (step 8, no JSX).
 * The modal renders these strings; the wording lives here so JSX stays
 * presentation-only (AGENTS.md §4). Times render in the user's timezone;
 * ids are shown shortened when no title travels with the action.
 * Pass `t` for the current locale; without it English fallbacks apply.
 */

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatInstant(iso: string, timeZone: string, intl = "en-US"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(intl, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
}

export function describeProposalAction(
  action: ProposalAction,
  timeZone: string,
  t?: Messages["assistant"],
  intl: string = "en-US",
): string {
  const a = t ?? {
    actionCreateGoal: "Create goal: {title}",
    actionCreateGoalTarget: "Create goal: {title} (target {date})",
    actionCreateMilestone: "Create milestone: {title}",
    actionCreateMilestoneTarget: "Create milestone: {title} (target {date})",
    actionCompleteMilestone: "Complete milestone {id}",
    actionCreateTask: "Create task: {title}",
    actionCreateTaskDue: "Create task: {title} (due {date})",
    actionRescheduleTask: "Reschedule task {id} to {date}",
    actionScheduleTask: "Schedule task {id}: {start} – {end}",
    actionUpdatePreferences: "Update preferences",
    actionNoChanges: "Update preferences (no changes)",
  };
  switch (action.type) {
    case "create_goal":
      return action.targetDate === null
        ? tmpl(a.actionCreateGoal, { title: action.title })
        : tmpl(a.actionCreateGoalTarget, { title: action.title, date: action.targetDate });
    case "create_milestone":
      return action.targetDate === null
        ? tmpl(a.actionCreateMilestone, { title: action.title })
        : tmpl(a.actionCreateMilestoneTarget, { title: action.title, date: action.targetDate });
    case "complete_milestone":
      return tmpl(a.actionCompleteMilestone, { id: shortId(action.milestoneId) });
    case "create_task":
      return action.dueDate === null
        ? tmpl(a.actionCreateTask, { title: action.title })
        : tmpl(a.actionCreateTaskDue, { title: action.title, date: action.dueDate });
    case "reschedule_task":
      return tmpl(a.actionRescheduleTask, { id: shortId(action.taskId), date: action.newDate });
    case "schedule_blocks":
      return tmpl(a.actionScheduleTask, {
        id: shortId(action.taskId),
        start: formatInstant(action.startTime, timeZone, intl),
        end: formatInstant(action.endTime, timeZone, intl),
      });
    case "update_preferences": {
      const changes: string[] = [];
      if (action.wakeUpTime !== null) {
        changes.push(`wake-up ${action.wakeUpTime}`);
      }
      if (action.sleepTime !== null) {
        changes.push(`sleep ${action.sleepTime}`);
      }
      if (action.timezone !== null) {
        changes.push(`timezone ${action.timezone}`);
      }
      if (action.language !== null) {
        changes.push(`language ${action.language}`);
      }
      if (action.theme !== null) {
        changes.push(`theme ${action.theme}`);
      }
      return changes.length === 0
        ? a.actionNoChanges
        : `${a.actionUpdatePreferences}: ${changes.join(", ")}`;
    }
  }
}
