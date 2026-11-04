import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBlock, deleteBlock, listBlocks, updateBlock } from "./api";
import { PlanPreview } from "./PlanPreview";
import type {
  PlanPreview as PlanPreviewModel,
  PlanPreviewAlreadyPlanned,
  PlanPreviewIssue,
  PlanPreviewSlot,
} from "./usePlanPreview";

vi.mock("./api", () => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  getBlock: vi.fn(),
  listBlocks: vi.fn(),
  updateBlock: vi.fn(),
}));

const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";

function makeSlot(
  overrides: Partial<PlanPreviewSlot> & Pick<PlanPreviewSlot, "taskId" | "taskTitle">,
): PlanPreviewSlot {
  return {
    priority: "medium",
    overdue: false,
    start: `${DATE_KEY}T06:00:00.000Z`,
    end: `${DATE_KEY}T06:30:00.000Z`,
    startLabel: "07:00",
    endLabel: "07:30",
    crossesMidnight: false,
    durationMinutes: 30,
    reason: `"${overrides.taskTitle}" — planned 2026-11-04, 07:00–07:30 (30 min). medium priority, no due date.`,
    ...overrides,
  };
}

function makeIssue(
  overrides: Partial<PlanPreviewIssue> & Pick<PlanPreviewIssue, "taskId" | "taskTitle">,
): PlanPreviewIssue {
  return {
    priority: "medium",
    estimatedDurationMinutes: 60,
    reason: "too-long",
    explanation:
      "The estimate is longer than the longest free window on this day. Shorten the estimate or free up a longer stretch.",
    ...overrides,
  };
}

function makeAlreadyPlanned(
  overrides: Partial<PlanPreviewAlreadyPlanned> &
    Pick<PlanPreviewAlreadyPlanned, "taskId" | "taskTitle">,
): PlanPreviewAlreadyPlanned {
  return {
    priority: "medium",
    estimatedDurationMinutes: 60,
    blockId: `block-${overrides.taskId}`,
    start: `${DATE_KEY}T08:00:00.000Z`,
    end: `${DATE_KEY}T09:00:00.000Z`,
    startLabel: "09:00",
    endLabel: "10:00",
    crossesMidnight: false,
    explanation:
      "Already in your plan on this day, 09:00–10:00. Accepting the plan leaves this block untouched.",
    ...overrides,
  };
}

function makePreview({
  slots = [],
  doesNotFit = [],
  needsEstimate = [],
  alreadyPlanned = [],
  hasWakingHours = true,
  hasFreeWindows = true,
}: {
  slots?: PlanPreviewSlot[];
  doesNotFit?: PlanPreviewIssue[];
  needsEstimate?: PlanPreviewIssue[];
  alreadyPlanned?: PlanPreviewAlreadyPlanned[];
  hasWakingHours?: boolean;
  hasFreeWindows?: boolean;
}): PlanPreviewModel {
  const plannedMinutes = slots.reduce((total, slot) => total + slot.durationMinutes, 0);
  const unplacedMinutes = doesNotFit.reduce(
    (total, issue) => total + (issue.estimatedDurationMinutes ?? 0),
    0,
  );

  return {
    dateKey: DATE_KEY,
    timeZone: TIME_ZONE,
    slots,
    doesNotFit,
    needsEstimate,
    alreadyPlanned,
    summary: {
      candidateCount: slots.length + doesNotFit.length,
      slotCount: slots.length,
      plannedMinutes,
      unplacedCount: doesNotFit.length,
      unplacedMinutes,
      needsEstimateCount: needsEstimate.length,
      alreadyPlannedCount: alreadyPlanned.length,
      hasWakingHours,
      hasFreeWindows,
    },
    canAccept: slots.length > 0,
  };
}

function renderPreview(
  preview: PlanPreviewModel,
  overrides: Partial<Parameters<typeof PlanPreview>[0]> = {},
) {
  return render(
    <PlanPreview
      preview={preview}
      onAccept={vi.fn()}
      onRegenerate={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

const READY = makePreview({
  slots: [
    makeSlot({ taskId: "t1", taskTitle: "Write the report", priority: "high" }),
    makeSlot({
      taskId: "t2",
      taskTitle: "Reply to the client",
      startLabel: "07:30",
      endLabel: "08:00",
      start: `${DATE_KEY}T06:30:00.000Z`,
      end: `${DATE_KEY}T07:00:00.000Z`,
      overdue: true,
      reason: `"Reply to the client" — planned 2026-11-04, 07:30–08:00 (30 min). medium priority, due 2026-11-03 (overdue).`,
    }),
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanPreview", () => {
  it("shows a loading status instead of an empty plan", () => {
    renderPreview(makePreview({}), { isLoading: true });

    expect(screen.getByRole("status", { name: "Building the plan" })).toBeInTheDocument();
    expect(screen.queryByText("Plan preview")).not.toBeInTheDocument();
  });

  it("shows a recoverable error and retries on demand", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    renderPreview(makePreview({}), { isError: true, onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not build the plan");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The tasks and blocks for this day did not load. Check your connection, then try again.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("asks for waking hours before it can plan", () => {
    renderPreview(makePreview({ hasWakingHours: false }));

    expect(screen.getByText("Set your waking hours first")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The plan is built between your wake-up and sleep time. Add both in Settings, then build the plan again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept plan" })).toBeDisabled();
  });

  it("explains the next step when there is nothing to plan", () => {
    renderPreview(makePreview({}));

    expect(screen.getByText("No open tasks to plan")).toBeInTheDocument();
    expect(
      screen.getByText("Add a task with a time estimate, then build the plan again."),
    ).toBeInTheDocument();
  });

  it("lists the slots with their time, duration, priority and why", () => {
    renderPreview(READY);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    const [first, second] = rows;
    expect(within(first).getByText("07:00")).toBeInTheDocument();
    expect(within(first).getByText("07:30")).toBeInTheDocument();
    expect(within(first).getByText("Write the report")).toBeInTheDocument();
    expect(within(first).getByText("High priority")).toBeInTheDocument();
    expect(within(first).getByText("30 min")).toBeInTheDocument();
    expect(
      within(first).getByText(
        '"Write the report" — planned 2026-11-04, 07:00–07:30 (30 min). medium priority, no due date.',
      ),
    ).toBeInTheDocument();

    expect(within(second).getByText("Overdue")).toBeInTheDocument();
    expect(
      within(second).getByText(
        '"Reply to the client" — planned 2026-11-04, 07:30–08:00 (30 min). medium priority, due 2026-11-03 (overdue).',
      ),
    ).toBeInTheDocument();
  });

  it("summarises what is planned and what is still to place", () => {
    renderPreview(READY);

    const summary = screen.getByText("Planned").closest("dl");
    expect(summary).not.toBeNull();

    const stats = within(summary as HTMLElement);
    expect(stats.getByText("Planned")).toBeInTheDocument();
    expect(stats.getByText("1 h")).toBeInTheDocument();
    expect(stats.getByText("Left to place")).toBeInTheDocument();
    expect(stats.getByText("Needs an estimate")).toBeInTheDocument();
    expect(stats.getAllByText("None")).toHaveLength(2);
    expect(screen.getByText("Times shown in Europe/Berlin.")).toBeInTheDocument();
    expect(screen.getByText("2 slots")).toBeInTheDocument();
  });

  it("lists both problem groups with a plain explanation", () => {
    renderPreview(
      makePreview({
        slots: [makeSlot({ taskId: "t1", taskTitle: "Write the report" })],
        doesNotFit: [makeIssue({ taskId: "t2", taskTitle: "Rewrite the deck" })],
        needsEstimate: [
          makeIssue({
            taskId: "t3",
            taskTitle: "Plan the launch",
            estimatedDurationMinutes: null,
            reason: "needs-estimate",
            explanation:
              "This task has no time estimate. Add one so the planner knows how much time to reserve.",
          }),
        ],
      }),
    );

    expect(screen.getByText("Not placed today")).toBeInTheDocument();
    expect(
      screen.getByText("These tasks have an estimate but found no room on this day."),
    ).toBeInTheDocument();
    expect(screen.getByText("Rewrite the deck")).toBeInTheDocument();
    expect(
      screen.getByText(/The estimate is longer than the longest free window/),
    ).toBeInTheDocument();

    const needsEstimateSection = screen.getByText("Plan the launch").closest("section");
    expect(needsEstimateSection).not.toBeNull();

    const needsEstimateGroup = within(needsEstimateSection as HTMLElement);
    expect(needsEstimateGroup.getByText("Needs an estimate")).toBeInTheDocument();
    expect(
      needsEstimateGroup.getByText("The planner reserves time only for tasks with an estimate."),
    ).toBeInTheDocument();
    expect(
      needsEstimateGroup.getByText(
        "This task has no time estimate. Add one so the planner knows how much time to reserve.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Estimate: 1 h")).toBeInTheDocument();
  });

  it("shows the tasks that are already planned with their local time", () => {
    renderPreview(
      makePreview({
        slots: [makeSlot({ taskId: "t1", taskTitle: "Fresh task" })],
        alreadyPlanned: [makeAlreadyPlanned({ taskId: "t2", taskTitle: "Planned already" })],
      }),
    );

    expect(screen.getByText("Already in your plan")).toBeInTheDocument();
    expect(screen.getByText("Planned already")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(
      screen.getByText(/Accepting the plan leaves this block untouched/),
    ).toBeInTheDocument();
  });

  it("says so when both problem groups are empty", () => {
    renderPreview(
      makePreview({ slots: [makeSlot({ taskId: "t1", taskTitle: "Write the report" })] }),
    );

    expect(screen.getByText("Every task with an estimate fits into this day.")).toBeInTheDocument();
    expect(screen.getByText("Every open task has an estimate.")).toBeInTheDocument();
  });

  it("warns when the day has no free time left", () => {
    renderPreview(
      makePreview({
        hasFreeWindows: false,
        doesNotFit: [makeIssue({ taskId: "t2", taskTitle: "Rewrite the deck" })],
      }),
    );

    expect(
      screen.getByText(
        "There is no free time left on this day. Free up time or pick another day, then build the plan again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept plan" })).toBeDisabled();
    expect(
      screen.getByText(
        "Accept stays off while no slot is planned. Regenerate after changing the day, or cancel to leave the schedule as it is.",
      ),
    ).toBeInTheDocument();
  });

  it("calls each callback once and writes nothing", async () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    renderPreview(READY, { onAccept, onRegenerate, onCancel });

    await user.click(screen.getByRole("button", { name: "Accept plan" }));
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // A preview is never a write: no block is created, updated, deleted or re-read here.
    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(listBlocks).not.toHaveBeenCalled();
  });

  it("keeps accept and regenerate off while a caller saves", async () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    renderPreview(READY, { onAccept, onRegenerate, onCancel, isSaving: true });

    expect(screen.getByRole("button", { name: "Accept plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Accept plan" }));
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onAccept).not.toHaveBeenCalled();
    expect(onRegenerate).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
