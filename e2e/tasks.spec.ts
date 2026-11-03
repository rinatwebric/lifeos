import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live tasks flow (iteration 2, unit 6). Hits the real Supabase project with
 * the shared e2e account — no `service_role`, only UI paths. The task title
 * carries a timestamp so reruns never collide; the flow deletes the task it
 * creates, leaving the account clean.
 */

skipWithoutCreds();

test("tasks: create, filter, complete, reschedule and delete", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  const title = `E2E task ${Date.now()}`;

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create task" }).click();

  const row = page.locator("li", { hasText: title });
  await expect(row).toBeVisible();

  // Server-side status filter: the fresh todo task hides under "completed".
  await page.getByLabel("Status", { exact: true }).selectOption("completed");
  await expect(row).toHaveCount(0);
  await page.getByLabel("Status", { exact: true }).selectOption("");
  await expect(row).toBeVisible();

  // Complete through the checkbox (optimistic toggle).
  await row.getByRole("checkbox", { name: `Mark ${title} as completed` }).click();
  await expect(
    row.getByRole("checkbox", { name: `Mark ${title} as not completed` }),
  ).toBeVisible();

  // Reschedule to a future date; the row shows the new due date.
  await row.getByRole("button", { name: "Reschedule" }).click();
  const reschedule = page.getByRole("dialog");
  await reschedule.getByLabel("Due date").fill("2030-01-15");
  await reschedule.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("2030-01-15")).toBeVisible();

  // Delete only happens after confirmation.
  await row.getByRole("button", { name: `Delete ${title}` }).click();
  const confirm = page.getByRole("dialog");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
});
