import type { ProposalAction } from "@/lib/aiProposals";

/**
 * Human-readable one-liners for proposal actions (step 8, no JSX).
 * The modal renders these strings; the wording lives here so JSX stays
 * presentation-only (AGENTS.md §4). Times render in the user's timezone;
 * ids are shown shortened when no title travels with the action.
 */

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatInstant(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
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

export function describeProposalAction(action: ProposalAction, timeZone: string): string {
  switch (action.type) {
    case "create_goal":
      return action.targetDate === null
        ? `Create goal: ${action.title}`
        : `Create goal: ${action.title} (target ${action.targetDate})`;
    case "create_milestone":
      return action.targetDate === null
        ? `Create milestone: ${action.title}`
        : `Create milestone: ${action.title} (target ${action.targetDate})`;
    case "complete_milestone":
      return `Complete milestone ${shortId(action.milestoneId)}`;
    case "create_task":
      return action.dueDate === null
        ? `Create task: ${action.title}`
        : `Create task: ${action.title} (due ${action.dueDate})`;
    case "reschedule_task":
      return `Reschedule task ${shortId(action.taskId)} to ${action.newDate}`;
    case "schedule_blocks":
      return `Schedule task ${shortId(action.taskId)}: ${formatInstant(action.startTime, timeZone)} – ${formatInstant(action.endTime, timeZone)}`;
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
        ? "Update preferences (no changes)"
        : `Update preferences: ${changes.join(", ")}`;
    }
  }
}
