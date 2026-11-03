import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live dashboard flow (iteration 2, unit 8). Hits the real Supabase project
 * with the shared e2e account — no `service_role`, only UI paths. Creates a
 * uniquely named active goal with two milestones (one completed → 50%) and
 * two tasks due today, asserts the dashboard shows them with the correct
 * daily percent, toggles one task and asserts the percent moves, then deletes
 * everything it created.
 */

skipWithoutCreds();

test("dashboard: goal with milestones and today's tasks, toggle moves the percent", async ({
  page,
}) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  const stamp = Date.now();
  const goalTitle = `E2E dash goal ${stamp}`;
  const taskA = `E2E dash task A ${stamp}`;
  const taskB = `E2E dash task B ${stamp}`;

  // The e2e profile keeps its own time zone (currently UTC): derive "today"
  // from the zone the dashboard header actually reports, not from the
  // runner machine's local date (they differ across midnight boundaries).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  const headerText = (await page.getByText(/times shown in/).textContent()) ?? "";
  const profileTimeZone = headerText.split("times shown in")[1]?.trim() || "UTC";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profileTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Goal (active so the dashboard picks it up).
  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New goal" }).click();
  const goalDialog = page.getByRole("dialog");
  await goalDialog.getByLabel("Title").fill(goalTitle);
  await goalDialog.getByLabel("Status").selectOption("active");
  await goalDialog.getByLabel("Calculate progress from milestones").check();
  await goalDialog.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();

  // Detail page: two milestones, complete the first → 50%.
  await page.getByRole("link", { name: goalTitle }).click();
  await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
  const milestoneInput = page.getByLabel("Add a milestone");
  await milestoneInput.fill(`E2E dash ms 1 ${stamp}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`E2E dash ms 1 ${stamp}`)).toBeVisible();
  await milestoneInput.fill(`E2E dash ms 2 ${stamp}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`E2E dash ms 2 ${stamp}`)).toBeVisible();
  await page
    .getByRole("checkbox", { name: `Mark E2E dash ms 1 ${stamp} as completed` })
    .click();
  await expect(page.getByText("50% complete").first()).toBeVisible();

  // Two tasks due today.
  await page.goto("/tasks");
  for (const title of [taskA, taskB]) {
    await page.getByRole("button", { name: "New task" }).click();
    const taskDialog = page.getByRole("dialog");
    await taskDialog.getByLabel("Title").fill(title);
    await taskDialog.getByLabel("Due date").fill(today);
    await taskDialog.getByRole("button", { name: "Create task" }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();
  }

  // Dashboard shows the goal, both tasks and 0 of 2.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByRole("link", { name: goalTitle })).toBeVisible();
  await expect(page.locator("li", { hasText: taskA })).toBeVisible();
  await expect(page.locator("li", { hasText: taskB })).toBeVisible();
  await expect(page.getByText("Completed 0 of 2 tasks today").first()).toBeVisible();

  // Toggle one task → the percent moves.
  await page.getByRole("checkbox", { name: `Mark ${taskA} as completed` }).click();
  await expect(page.getByText("Completed 1 of 2 tasks today").first()).toBeVisible();

  // Cleanup: both tasks, then the goal.
  await page.goto("/tasks");
  for (const title of [taskA, taskB]) {
    const row = page.locator("li", { hasText: title });
    await row.getByRole("button", { name: `Delete ${title}` }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0);
  }

  await page.goto("/goals");
  await page.getByRole("button", { name: `Delete ${goalTitle}` }).click();
  const goalConfirm = page.getByRole("dialog");
  await goalConfirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: goalTitle })).toHaveCount(0);
});
