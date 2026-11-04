import { describe, expect, it, vi } from "vitest";

import { TOOL_DEFINITIONS, TOOL_NAMES, buildToolContext } from "./tools.ts";

describe("assistant tool layer skeleton", () => {
  it("exposes the nine PRD tools and nothing else", () => {
    expect(TOOL_NAMES).toStrictEqual([
      "get_user_goals",
      "get_user_tasks",
      "get_weekly_progress",
      "get_user_preferences",
      "suggest_goal_breakdown",
      "suggest_task_creation",
      "suggest_schedule",
      "suggest_schedule_changes",
      "analyze_productivity",
    ]);
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toStrictEqual([...TOOL_NAMES]);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("returns an honest empty context instead of fabricated rows", async () => {
    const from = vi.fn(() => {
      throw new Error("skeleton must not query");
    });
    const context = await buildToolContext({ from });
    expect(context).toStrictEqual({ goals: [], tasks: [], truncated: false });
    expect(from).not.toHaveBeenCalled();
  });
});
