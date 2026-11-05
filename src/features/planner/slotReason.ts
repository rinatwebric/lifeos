import { tmpl } from "@/lib/i18n/format";
import type { Messages } from "@/lib/i18n/I18nContext";
import type { SlotReasonParts } from "@/lib/planner";

/**
 * Renders structured slot reasons with dictionary templates (stable keys).
 * User content (title/date/time) passes through untranslated by design.
 */
export function formatSlotReason(
  parts: SlotReasonParts,
  t: Messages["planner"],
  priorityLabel: string,
): string {
  const reasons: string[] = [tmpl(t.slotReasonPriority, { priority: priorityLabel })];

  if (parts.dueState === "overdue" && parts.dueDate) {
    reasons.push(tmpl(t.slotReasonDueOverdue, { date: parts.dueDate }));
  } else if (parts.dueState === "due" && parts.dueDate) {
    reasons.push(tmpl(t.slotReasonDue, { date: parts.dueDate }));
  } else {
    reasons.push(t.slotReasonNoDue);
  }

  if (parts.linked) reasons.push(t.slotReasonLinked);
  if (parts.preferred) reasons.push(t.slotReasonPreferred);
  if (parts.workOverlap) reasons.push(t.slotReasonWorkOverlap);

  return tmpl(t.slotReason, {
    title: parts.title,
    date: parts.date,
    time: parts.timeRange,
    minutes: parts.minutes,
    reasons: reasons.join(", "),
  });
}

/** Issue explanations by stable reason code (never English comparison). */
export function formatIssueExplanation(
  reason: "no-window" | "too-long" | "needs-estimate" | "no-free-time",
  t: Messages["planner"],
): string {
  switch (reason) {
    case "too-long":
      return t.issueTooLong;
    case "no-window":
      return t.issueNoWindow;
    case "no-free-time":
      return t.issueNoFreeTime;
    case "needs-estimate":
      return t.issueNeedsEstimate;
  }
}
