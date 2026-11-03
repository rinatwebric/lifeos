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

  it("never leaks raw Postgres text in message; keeps it in details", () => {
    const raw = 'duplicate key value violates unique constraint "goals_title_key"';
    const error = toGoalError({ message: raw });
    expect(error.code).toBe("conflict");
    expect(error.message).toBe(GOAL_ERROR_MESSAGES.conflict);
    expect(error.details).toBe(raw);
  });

  it("maps 22007/22008 and bad date syntax to validation", () => {
    for (const raw of [
      { code: "22007", message: "invalid_datetime_format" },
      { code: "22008", message: "datetime_field_overflow" },
      { message: "invalid input syntax for type date: \"2026-02-30\"" },
    ]) {
      const error = toGoalError(raw);
      expect(error.code).toBe("validation");
      expect(error.message).toBe(GOAL_ERROR_MESSAGES.validation);
      expect(error.details).toBe(
        typeof (raw as { message?: unknown }).message === "string"
          ? ((raw as { message: string }).message)
          : undefined,
      );
    }
  });
});
