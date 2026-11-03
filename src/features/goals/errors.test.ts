import { describe, expect, it } from "vitest";

import { GoalServiceError, GOAL_ERROR_MESSAGES, toGoalError } from "./errors";

describe("toGoalError", () => {
  it("passes GoalServiceError through untouched", () => {
    const original = new GoalServiceError("network", "down");
    expect(toGoalError(original)).toBe(original);
  });

  it("maps 23514 CHECK violations to validation", () => {
    const error = toGoalError({
      code: "23514",
      message: 'violates check constraint "goals_progress_check"',
    });
    expect(error.code).toBe("validation");
    expect(error).toBeInstanceOf(GoalServiceError);
  });

  it("maps 23503 FK violations to conflict", () => {
    const error = toGoalError({
      code: "23503",
      message: 'violates foreign key constraint "milestones_goal_id_fkey"',
    });
    expect(error.code).toBe("conflict");
  });

  it("maps 42501 RLS denials to forbidden", () => {
    const error = toGoalError({
      code: "42501",
      message: "permission denied for table goals",
    });
    expect(error.code).toBe("forbidden");
  });

  it("maps PGRST116 zero-rows to not_found", () => {
    const error = toGoalError({
      code: "PGRST116",
      message: "Cannot coerce the result to a single JSON object",
    });
    expect(error.code).toBe("not_found");
  });

  it("maps network failures to network", () => {
    expect(toGoalError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(toGoalError(new Error("network error")).code).toBe("network");
  });

  it("falls back to unknown with the default copy", () => {
    const error = toGoalError({ message: "something odd" });
    expect(error.code).toBe("unknown");
    expect(toGoalError(null).code).toBe("unknown");
    expect(GOAL_ERROR_MESSAGES.unknown).toBe("Something went wrong. Please try again.");
  });
});
